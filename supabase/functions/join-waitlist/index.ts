// Supabase Edge Function: join-waitlist. NOT deployed: deployment and every
// secret below need the founder's approval (docs/WAITLIST.md).
//
// Environment (set as Supabase function secrets, never in the repository):
//   WAITLIST_FUNCTION_ENABLED   'true' to accept submissions; anything else = closed
//   WAITLIST_ALLOWED_ORIGINS    comma-separated exact origins allowed to call it
//   WAITLIST_ALLOWED_HOSTNAMES  comma-separated hostnames Turnstile must report
//   TURNSTILE_SECRET_KEY        Cloudflare Turnstile secret
//   WAITLIST_RATE_SALT          random string used to hash client addresses
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  provided by Supabase
//
// Deploy with JWT verification off (the function checks the origin and
// Turnstile itself): supabase functions deploy join-waitlist --no-verify-jwt

import { handleJoin, hashClientKey, submitThroughDataApi, verifyWithCloudflare } from './handler.ts'

const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const list = (k: string) =>
  env(k)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

Deno.serve(async (req: Request) => {
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const out = await handleJoin(
    {
      method: req.method,
      origin: req.headers.get('origin'),
      contentType: req.headers.get('content-type'),
      body: req.method === 'POST' ? await req.text() : '',
      ip,
    },
    {
      enabled: env('WAITLIST_FUNCTION_ENABLED') === 'true',
      allowedOrigins: list('WAITLIST_ALLOWED_ORIGINS'),
      allowedHostnames: list('WAITLIST_ALLOWED_HOSTNAMES'),
      verifyTurnstile: (token, clientIp) => verifyWithCloudflare(token, clientIp, env('TURNSTILE_SECRET_KEY'), fetch),
      clientKey: (clientIp) => hashClientKey(clientIp, env('WAITLIST_RATE_SALT')),
      submit: (payload) => submitThroughDataApi(payload, env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), fetch),
    },
  )
  return new Response(out.body || null, { status: out.status, headers: out.headers })
})
