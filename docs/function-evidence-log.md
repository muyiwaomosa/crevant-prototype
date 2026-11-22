# Edge Function evidence log

Appended by `scripts/functions/deploy.mjs` on the founder's computer, for every
deploy, rollback and emergency deletion (operator and reason included), and
committed in a reviewed PR. No secrets, tokens, account ids or connection
strings. See `docs/FUNCTIONS-DEPLOYMENT.md`.

| Time (UTC) | Action | Target | Project | Function | Commit | Version | Operator | Reason | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-22T22:36:36Z | independent verification FAILED (recorded by hand from the verify run, in the fix PR) | staging | kpudeppgokpjhvaqrprn | avatar | e7e298da896ccc58ade2ec983b22e381d70e7fa6 | v3 | verify-functions.yml run 45078411583 | | 204 passed, 21 failed. Build stamp served e7e298d.df68ee6e (digest of a CRLF export: core.autocrlf=true on Windows) instead of e7e298d.6ee3e5d5 (the commit's bytes); deploy-time C1 had matched because it compared with the export. One remove request (no origin, no session) got a 503 without a build stamp (platform response, cause not yet established). State: failed verification; not approved; the ledger is unchanged. |
