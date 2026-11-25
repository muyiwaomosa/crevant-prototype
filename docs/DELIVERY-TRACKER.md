# Delivery tracker

A package is **delivered** only when the founder has accepted it on staging.

* **Built:** complete in a pull request.
* **Tested:** local suites and CI green.
* **Merged:** on `main` (merging approves its migration checksum, D7).
* **Deployed:** on staging (database, any Auth settings, and the `staging` app build).
* **Accepted:** the founder has used it on staging and signed off.

Staging app: https://splitpost-app-git-staging-crevant.vercel.app (the `staging` branch, fast-forwarded only to merged `main`). Acceptance steps: `docs/STAGING-ACCEPTANCE.md`.

| Package | Built | Tested | Merged | Deployed (staging) | Accepted | Notes |
|---|---|---|---|---|---|---|
| IP-1 Foundation | Yes | Yes, CI 6 of 6 | Yes, PR #106, Nov 25 | Database: apply run awaiting environment approval. Then founder Auth settings (A3) and staging access (A4) | Pending | Production registration paused, launch gate closed |
| IP-2 Relationships and Home | Yes | Yes, CI 6 of 6, all 8 browser journeys | Yes, PR #107, Nov 25 | Same apply run as IP-1 (migrations apply in order). No Auth step | Pending | Active Supporter definition provisional until metric review (N8) |
| IP-3 Governance core | Not started | | | | | Awaiting authorization |
| IP-4 Content and discovery | In progress | | | | | Value and intent-based discovery, basic search kept |
| IP-5 Video posts | Not started | | | | | Depends on the device test |
| IP-6 Contributions and rewards | Not started | | | | | Depends on IP-4 |
| IP-7 Advertising | Not started | | | | | Depends on IP-3, IP-4 |
| IP-8 Intelligence | Not started | | | | | Depends on IP-6, IP-7 |
| IP-9 Brand and acquisition | Not started | | | | | |
| IP-10 Release | Not started | | | | | |

| Production batch | Planned | Status |
|---|---|---|
| PB-1 Operations (SMTP, drain key, health checks, ledger) | Nov 28 | Prepared, awaiting founder approval (`docs/STAGING-ACCEPTANCE.md`, Part C) |
| PB-2 Migrations and functions | Dec 16 | Not started |
| PB-3 Release candidate fixes | Dec 20 | Not started |
| PB-4 Open external access | Dec 23 | Not started |
