# Notes for agents working in this repository

## Waiting for CI

- Never wait with fixed sleeps. Prefer PR activity notifications: subscribe to
  the pull request and end the turn; CI results arrive as events.
- Without notifications, poll the run's status about every 60 seconds until it
  completes, then read the result. One CI run takes about 5 minutes.

## Running the integration suites locally

Use one command, against your local Supabase only (it refuses anything else):

```bash
scripts/ci/local-integration.sh
```

That resets the local database and runs every suite in CI order, then
`npm test`, with each suite's duration at the end. While iterating, run only
the suite you changed, on the database as it is:

```bash
scripts/ci/local-integration.sh post-media-edge
```

`--list` shows the suite names; `--reset <suite>` resets first. The post-media
and photo cleanup schedule suites can run again on the same database. The
rollback suite needs an empty picture store, so reset before rerunning it.
Run the full sequence once before pushing.

## Ground rules

- Never run the staging or Production workflows, and don't touch staging,
  Production, Vercel, the public site or the `demo` branch.
- Don't skip, quarantine or loosen a test. Fix flaky ones at the cause.
- Changing a pinned SQL script means updating its pinned checksum in the same
  reviewed pull request.
- Never signal processes inside the database container in tests (a `pkill`
  there once restarted Postgres). Run helpers in their own containers beside it.
- Check fixtures loudly: a fixture that silently fails to insert hides a test.
