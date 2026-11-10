// A3 proxy diagnostic: Supabase Edge Function entry point. TEMPORARY, STAGING
// ONLY: never merged into main; deleted after the hosted test. Deployment,
// its settings and its deletion each need the founder's approval
// (diagnostics/proxy-diagnostic/README.md).
//
// Every request that isn't an enabled, unexpired, authenticated GET on the
// staging project gets the same bare 404, with no body. The log line for each
// request is the status code only.

import { authorised, describe, readConfig, type Setting } from './diagnose.ts'

const env = (k: Setting) => (Deno.env.get(k) ?? '').trim()
const NO_STORE = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }

Deno.serve(async (req: Request) => {
  let status = 404
  try {
    const config = readConfig(env, Date.now())
    if (req.method === 'GET' && config !== null && (await authorised(req.headers, config))) {
      status = 200
      return Response.json(describe(req.headers, config, Date.now()), { headers: NO_STORE })
    }
  } catch {
    status = 404
  } finally {
    console.log(JSON.stringify({ event: 'diag', status }))
  }
  return new Response(null, { status: 404, headers: NO_STORE })
})
