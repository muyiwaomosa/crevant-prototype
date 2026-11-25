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
| IP-1 Foundation | Yes | Yes, CI 6 of 6 | Yes, PR #106, Nov 25 | Database applied and checked Nov 25 14:00. Founder steps A1 to A4 pending | Pending | Production registration paused, launch gate closed |
| IP-2 Relationships and Home | Yes | Yes, CI 6 of 6 | Yes, PR #107, Nov 25 | Database applied and checked Nov 25 14:00 | Pending | Active Supporter definition provisional until metric review (N8) |
| IP-3 Governance core | Not started | | | | | Awaiting authorization |
| IP-4a Content (topics, editing, saves, reposts) | Yes | Yes, CI 6 of 6 | Yes, PR #108, Nov 25 | Database apply awaiting environment approval | No | Review guide `docs/CONTENT.md` |
| IP-4b Discovery and sharing | Yes | Yes, CI 6 of 6 | Yes, PR #108, Nov 25 | Same apply run | No | Discovery accepted by the founder in principle; review guide `docs/DISCOVERY.md` |
| IP-4c Fair rotation, search measurement, public previews | Yes | Local: all suites and 10 browser journeys pass; CI pending | No | No | No | Previews off by default; Production activation needs its own approval. Review guide `docs/PREVIEWS.md` |
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
