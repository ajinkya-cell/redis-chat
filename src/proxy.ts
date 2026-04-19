import { NextRequest, NextResponse } from "next/server"
import { redis } from "./lib/redis"
import { nanoid } from "nanoid"

export const proxy = async (req: NextRequest) => {
  const pathname = req.nextUrl.pathname
  const roomMatch = pathname.match(/^\/room\/([^/]+)$/)

  // ✅ since matcher already limits routes
  if (!roomMatch) return NextResponse.redirect(new URL('/',req.url))

  const roomId = roomMatch[1]
  const roomKey = `meta:${roomId}`

  const rawMeta = await redis.hgetall<{connected : string[] ; createdAt: number}>(roomKey)

  // ✅ room not found
  if (!rawMeta || Object.keys(rawMeta).length === 0) {
    return NextResponse.redirect(
      new URL("/?error=room-not-found", req.url)
    )
  }

  const rawConnected = rawMeta.connected
  const meta = {
    connected: Array.isArray(rawConnected)
      ? rawConnected
      : rawConnected
        ? JSON.parse(rawConnected)
        : [],
    createdAt: rawMeta.createdAt
      ? Number(rawMeta.createdAt)
      : Date.now(),
  }

  const existingToken = req.cookies.get("x-auth-token")?.value

  // ✅ already connected
  if (existingToken && meta.connected.includes(existingToken)) {
    return NextResponse.next()
  }

  // ❌ room full
  if (meta.connected.length >= 2) {
    return NextResponse.redirect(
      new URL("/?error=room-full", req.url)
    )
  }

  // ✅ join room
  const token = nanoid()
  const response = NextResponse.next()

  response.cookies.set("x-auth-token", token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  })

  await redis.hset(roomKey, {
    connected: JSON.stringify([...meta.connected, token]),
  })

  return response
}

export const config = {
  matcher: "/room/:path*",
}
