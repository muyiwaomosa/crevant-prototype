// Supabase Edge Function: join-waitlist. NOT deployed: deployment and every
// secret below need the founder's approval (docs/WAITLIST.md).
//
// Environment (set as Supabase function secrets, never in the repository):
//   WAITLIST_FUNCTION_ENABLED   'true' to accept submissions; anything else = closed
//   WAITLIST_ALLOWED_ORIGINS    comma-separated exact origins allowed to call it
//   WAITLIST_ALLOWED_HOSTNAMES  comma-separated hostnames Turnstile must report
//   TURNSTILE_SECRET_KEY        Cloudflare Turnstile secret. Missing = closed.
//   WAITLIST_RATE_SALT          random string (at least 32 characters) used to
//                               hash client addresses. Missing or short = closed.
//   WAITLIST_TRUSTED_PROXY_HOPS how many X-Forwarded-For entries, counted from
//                               the right, Supabase's own proxies add (default 1).
//                               Confirm before activation (docs/WAITLIST.md).
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  provided by Supabase
//
// Deploy with JWT verification off (the function checks the origin and
// Turnstile itself): supabase functions deploy join-waitlist --no-verify-jwt

import { clientIpFrom, handleJoin, hashClientKey, submitThroughDataApi, verifyWithCloudflare } from './handler.ts'

const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const list = (k: string) =>
  env(k)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

Deno.serve(async (req: Request) => {
  // Only the trusted hop of X-Forwarded-For; client-supplied headers are ignored.
  const ip = clientIpFrom(req.headers.get('x-forwarded-for'), Number(env('WAITLIST_TRUSTED_PROXY_HOPS') || '1'))
  const out = await handleJoin(
    {
      method: req.method,
      origin: req.headers.get('origin'),
      contentType: req.headers.get('content-type'),
      body: req.method === 'POST' ? await req.text() : '',
      ip,
    },
    {
      // Fails closed if a secret the checks depend on is missing.
      enabled:
        env('WAITLIST_FUNCTION_ENABLED') === 'true' && env('WAITLIST_RATE_SALT').length >= 32 && env('TURNSTILE_SECRET_KEY') !== '',
      allowedOrigins: list('WAITLIST_ALLOWED_ORIGINS'),
      allowedHostnames: list('WAITLIST_ALLOWED_HOSTNAMES'),
      verifyTurnstile: (token, clientIp) => verifyWithCloudflare(token, clientIp, env('TURNSTILE_SECRET_KEY'), fetch),
      clientKey: (clientIp) => hashClientKey(clientIp, env('WAITLIST_RATE_SALT')),
      submit: (payload) => submitThroughDataApi(payload, env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), fetch),
    },
  )
  return new Response(out.body || null, { status: out.status, headers: out.headers })
})
