// src/lib/api-error.ts
// Normalises backend errors into a typed ApiError so hooks NEVER discard the backend
// code/message for a hard-coded string. Reads the canonical error envelope
// { error: { code, message, details? } } and falls back for a bare FastAPI { detail }
// or an opaque error. See .claude/rules/api-contract.md (Canonical Wire Contract).
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function toApiError(error: unknown, fallback = 'Request failed'): ApiError {
  const e = error as
    { error?: { code?: string; message?: string; details?: unknown }; detail?: unknown } | undefined
  if (e?.error?.message)
    return new ApiError(e.error.code ?? 'unknown', e.error.message, e.error.details)
  if (typeof e?.detail === 'string') return new ApiError('unknown', e.detail)
  return new ApiError('unknown', fallback)
}
