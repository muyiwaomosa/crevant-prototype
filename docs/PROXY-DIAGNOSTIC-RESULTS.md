# Proxy diagnostic results (hosted staging check 3)

Staging only (`kpudeppgokpjhvaqrprn`). Code: `proxy-diagnostic` from the
never-merged PR #52 at the pinned commit `24bc859`. Run steps:
`docs/PROXY-DIAGNOSTIC-RUN.md` on that branch.

## Deployment, 2026-11-17

| Item | Result |
| --- | --- |
| Commit deployed | `24bc859` (reviewed, pinned) |
| Unauthenticated GET | 404, the function's own answer |
| Supabase JWT check | **Off.** "Verify JWT with legacy secret" is off, because the function was deployed with `--no-verify-jwt`. |

**Configuration difference from the design.** The threat model
(`docs/PROXY-DIAGNOSTIC-THREAT-MODEL.md`) and the run steps keep Supabase's
JWT check on, as an extra filter for casual traffic. It was off for this
run, so requests reached the function without the public key. The access
control is unchanged: the function answers a bare 404 unless
`DIAG_ENABLED` is `true`, the token matches (in constant time), and the
expiry is under 24 hours away. The founder accepted the difference for this
run, which is short lived and deleted in the same session. A repeat on
Production should keep the JWT check on.

## Results

To be filled in from the founder's output: the refusal tests, the answers
from two networks, the address check, the confirmed hop count, and the
cleanup confirmation.
