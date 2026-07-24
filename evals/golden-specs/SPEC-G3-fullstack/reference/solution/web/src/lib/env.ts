// src/lib/env.ts
// The single validated boundary for NEXT_PUBLIC_* environment variables. `process.env` is
// forbidden everywhere else (enforced by eslint no-restricted-syntax) — read validated values
// from here. In a browser context we throw (not process.exit) on invalid config.
import { z } from 'zod'

const EnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url(),
})

function readEnv(): z.infer<typeof EnvSchema> {
  const parsed = EnvSchema.safeParse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  })
  if (!parsed.success) {
    console.error('Invalid environment variables:', z.flattenError(parsed.error).fieldErrors)
    throw new Error('Invalid environment variables')
  }
  return parsed.data
}

export const env = readEnv()
