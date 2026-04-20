import { NextRequest, NextResponse } from "next/server"
import { redis } from "./lib/redis"
import { nanoid } from "nanoid"

export const proxy = async (req: NextRequest) => {
  const pathname = req.nextUrl.pathname
  const roomMatch = pathname.match(/^\/room\/([^/]+)$/)

  if (!roomMatch) return NextResponse.redirect(new URL("/", req.url))

  const roomId = roomMatch[1]
  const roomKey = `meta:${roomId}`

  const rawMeta = await redis.hgetall<{ connected: string; createdAt: number }>(roomKey)

  // Room not found (expired or never existed)
  if (!rawMeta || Object.keys(rawMeta).length === 0) {
    return NextResponse.redirect(new URL("/?error=room-not-found", req.url))
  }

  const rawConnected = rawMeta.connected
  const connected: string[] = Array.isArray(rawConnected)
    ? rawConnected
    : rawConnected
    ? JSON.parse(rawConnected)
    : []

  const existingToken = req.cookies.get("x-auth-token")?.value

  // Already a valid member of this room — let them through
  if (existingToken && connected.includes(existingToken)) {
    return NextResponse.next()
  }

  // New visitor — give them a token and register them.
  // 
  // ⚠️ There is intentionally NO "room full" check here anymore.
  // The old check caused false positives because WhatsApp (and other messaging
  // apps) open links in their own in-app browser (WebView), which is a completely
  // separate cookie jar from the user's main browser. So even the room CREATOR
  // would consume a second token slot just by opening their own link from WhatsApp,
  // leaving no room for the guest to join.
  //
  // Since room IDs are cryptographically random nanoids (unguessable), the room is
  // already private by obscurity — the "max 2 users" gate added no real security.
  const token = nanoid()
  const response = NextResponse.next()

  response.cookies.set("x-auth-token", token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // "strict" breaks links opened from WhatsApp/Telegram/email
  })

  await redis.hset(roomKey, {
    connected: JSON.stringify([...connected, token]),
  })

  return response
}

export const config = {
  matcher: "/room/:path*",
}
