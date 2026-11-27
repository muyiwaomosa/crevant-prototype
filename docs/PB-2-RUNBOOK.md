# PB-2 runbook: member Production migrations and functions

Prepared Nov 27 so PB-2 can run as soon as it is authorized, rather than on a
fixed date. Nothing here has been run. Every step uses the existing
workflows and their gates; none is bypassed. Checklist item: F1 in
`docs/ACCEPTANCE-CHECKLIST.md`.

## Where member Production stands

| Item | State | Evidence |
|---|---|---|
| Project | `splitpost-members-production` (`brfdqkondnnzsguailcc`, ca-central-1) | `config/supabase-projects.json` |
| Foundation migrations (20261106 to 20261121) | Applied Nov 22 | Run 44986958602 (apply-foundation) |
| Activation (20261122 to 20261129, launch gate included) | Applied Nov 22 | Run 44989940477 |
| Latest member database check | Passed Nov 23 at `27b323a` | Run 45092705816 |
| Invitations (external access) | **Not approved**: only the launch founder can hold membership | `config/member-production.json` |
| avatar function | v1 deployed at `d278415`; no change to its code since | `config/function-deployments.json` |
| post-media function | Approved for member Production, not yet deployed; no change since staging v3 (`74d41d7`) | same |

## What PB-2 applies

The 20 migrations after the launch gate, **20261130000000 to
20261219000000**: foundation v2, relationships, content, discovery,
previews and search, rewards, governance (and refinements), advertising (and
creatives and caps), intelligence, unified onboarding, privacy and switches,
video posts, release hardening, founder decisions, deletion register,
progression, progression rules, and pilot closure and triage.

* **Approval:** each one is on the approved list with its checksum
  (`supabase/approved-migrations.sha256`), founder D7 approved, and applied
  to staging.
* **Checks:** each one has its read-only check registered for member
  Production (`supabase/members-checks.txt`, 016 to 035). At the end of an
  apply run, every check must run and pass.
* **Rehearsal:** CI rehearses this exact sequence on throwaway databases in
  every run (`scripts/db/members-workflow-test.sh`: foundation, activation,
  the later migrations under the launch gate, then every check).

## Switch states right after the migrations (decide before PB-4)

The migrations create the operational switches with these defaults. With
invitations closed, only the founder can see any of it.

| Switch | Default | Note |
|---|---|---|
| Advertising | On | Nothing is served without an active campaign |
| Sharing | On | |
| Video posts (uploads) | Off | Stays refused until both phone device tests pass and the storage cap is set |
| Video playback | On | |
| Progression | Off | Your choice for the pilot, in Control Center |

## Sequence (each step needs you; Claude prepares and reads the results)

1. **Authorize PB-2** (the decision itself). It requires no open P0 or P1
   in the checklist.
2. **Restore point.** Confirm a backup or restore point exists for member
   Production. Both apply modes require this confirmation.
3. **Check.** In Deploy database to member Production, run `check` at the
   exact commit on main (owner only, `expected_commit` equal to the commit,
   project reference typed), and approve the `members-production`
   environment.
4. **Plan.** Run `plan` at the same commit. Claude confirms that the dry run
   lists exactly the 20 migrations above, and nothing else.
5. **Apply.** Run `apply` with the phrase `APPLY TO MEMBER PRODUCTION`. The
   run pushes the migrations, then runs every check, which must all pass.
6. **post-media function.** Deploy with `scripts/functions/deploy.mjs` at the
   commit of the successful `check` run, run **Verify Edge Functions**, then
   record it in `config/function-deployments.json` by reviewed PR
   (`docs/FUNCTIONS-DEPLOYMENT.md`). avatar needs no redeploy (unchanged).
   join-waitlist is never deployed here.
7. **Evidence.** Claude records each run in the evidence log of
   `docs/MEMBER-PRODUCTION.md` and ticks F1 in the checklist.

**Unchanged by PB-2:** invitations stay closed, real money cannot move, the
public site and the waitlist project are untouched, and PB-4 (external
access) still needs its own authorization.

## If something fails

* A failed verification before the push stops the run, and nothing is
  applied. A failed check after the push fails the run, and no later step
  (functions, PB-4) goes ahead until the cause is fixed.
* Claude reads the logs, classifies the failure (P0 to P3), and proposes the
  fix by PR. Nothing is retried blindly.
* A failed function verification means the deployment is not recorded and
  not used.
* Any restore follows `docs/RECOVERY.md`, with your explicit authorization.
