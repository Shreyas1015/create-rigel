// src/lib/env.ts
// The SINGLE validated boundary for environment variables. `process.env` is read ONLY
// here (enforced by ESLint no-restricted-syntax + the post-write hook); every other
// module imports the typed `env` object. Only NEXT_PUBLIC_* vars are readable in the
// browser bundle, so that is all this schema carries.
import { z } from 'zod'

const schema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
})

const parsed = schema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
})

if (!parsed.success) {
  // Browser context: throw (not process.exit) so the error surfaces in the app boundary.
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors)
  throw new Error('Invalid environment variables — see console for the failing keys.')
}

export const env = parsed.data
