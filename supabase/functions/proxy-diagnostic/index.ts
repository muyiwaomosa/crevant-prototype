// Temporary staging diagnostic (A3). See logic.ts and
// docs/PROXY-DIAGNOSTIC-THREAT-MODEL.md. Settings, all required:
//   DIAG_ENABLED     exactly 'true'
//   DIAG_TOKEN       at least 32 characters, from the password manager
//   DIAG_EXPIRES_AT  UTC time, for example 2026-11-18T03:00:00Z, under 24 hours away
// The token is sent in the X-Diagnostic-Token header. The Authorization
// header carries the project's public key for Supabase's own JWT check.
// Logs hold the status code only.
import { diagnose } from './logic.ts'

const env = (name: string) => Deno.env.get(name) ?? ''

Deno.serve(async (req) => {
  const out = await diagnose(
    { token: req.headers.get('x-diagnostic-token'), forwardedFor: req.headers.get('x-forwarded-for') },
    { enabled: env('DIAG_ENABLED'), token: env('DIAG_TOKEN'), expiresAt: env('DIAG_EXPIRES_AT'), now: Date.now() },
  )
  console.log(JSON.stringify({ status: out.status }))
  return new Response(out.status === 200 ? out.body : null, {
    status: out.status,
    headers: out.status === 200 ? { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } : { 'Cache-Control': 'no-store' },
  })
})
