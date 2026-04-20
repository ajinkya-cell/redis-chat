import { treaty } from '@elysiajs/eden'
import type { App } from '../app/api/[[...slugs]]/route'

// .api to enter /api prefix
const getApiUrl = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
}

export const client = treaty<App>(getApiUrl()).api