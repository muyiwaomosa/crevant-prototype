# Delivery tracker

Each package moves through four separate states. A package is **delivered**
only when the founder has accepted it on staging.

* **Built:** the work is complete in a pull request.
* **Tested:** CI is green and the package's own evidence passes.
* **Deployed:** on staging (database, Auth settings, app).
* **Accepted:** the founder has used it on staging and signed off.

Production is tracked by batch (PB-1 to PB-4), separately.

| Package | Built | Tested | Deployed (staging) | Accepted | Notes |
|---|---|---|---|---|---|
| IP-1 Foundation | Yes, PR #106 merged Nov 25 | Yes, 6 of 6 CI checks | In progress: database deploy awaiting environment approval; then Auth settings (founder, `docs/FOUNDER-GUIDE-IP1.md` A2) and app address (A3) | Pending | Registration paused on member Production; launch gate closed |
| IP-2 Relationships and Home | In progress (authorized Nov 25) | No | No | No | |
| IP-3 Governance core | Not started | | | | Awaiting authorization |
| IP-4 Content and discovery | Not started | | | | Depends on IP-2 |
| IP-5 Video posts | Not started | | | | Depends on the device test |
| IP-6 Contributions and rewards | Not started | | | | Depends on IP-4 |
| IP-7 Advertising | Not started | | | | Depends on IP-3, IP-4 |
| IP-8 Intelligence | Not started | | | | Depends on IP-6, IP-7 |
| IP-9 Brand and acquisition | Not started | | | | |
| IP-10 Release | Not started | | | | |

| Production batch | Planned | Status |
|---|---|---|
| PB-1 Operations (SMTP, drain key, health checks, ledger) | Nov 28 | Prepared, awaiting founder approval (`docs/FOUNDER-GUIDE-IP1.md`, Part B) |
| PB-2 Migrations and functions | Dec 16 | Not started |
| PB-3 Release candidate fixes | Dec 20 | Not started |
| PB-4 Open external access | Dec 23 | Not started |
