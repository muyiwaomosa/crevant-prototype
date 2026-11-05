# Phase 0: foundations

Part of the Crevant 60-day pilot plan (`docs/BETA-MIGRATION-PLAN.md`, section 17). This phase adds the groundwork every later phase builds on. It changes nothing a visitor to the demo can see, and it connects to no live service.

## What this phase adds

| Item | Where | Purpose |
| --- | --- | --- |
| Frozen demo branch | `demo` branch on GitHub, at commit `421a0a1` | Keeps the current Crevant demo exactly as it is while pilot work lands on `main` |
| Four separated data areas | `supabase/migrations/20261106000000_foundations.sql` | Creates the `finance`, `sim` and `analytics` schemas next to `public`, locked down so members and anonymous visitors have no direct access, including to anything created there later |
| Separation and permission checks | `supabase/tests/001_schema_separation.sql` | Proves the schemas exist, only server code can use them, new tables start locked, and nothing reads both real money (`finance`) and simulation (`sim`). Includes a negative test that a deliberate violation is caught |
| Test runner | `scripts/db/test.sh`, `scripts/db/bootstrap-roles.sql` | Applies every migration to an empty PostgreSQL database and runs the checks. The bootstrap creates Supabase's `anon`, `authenticated` and `service_role` roles for testing only |
| Secret scan | `scripts/check-bundle-secrets.sh` (`npm run check:secrets`) | Fails if a secret key pattern (Supabase secret, Stripe secret or webhook secret, Mux secret, email API key, private key) appears in the built frontend |
| Environment template | `.env.example` | Lists the public values the frontend needs and the secrets that must never be there |
| Brand configuration | `src/brand.ts` | One place for the product name. The Wordmark reads from it. Crevant stays the brand; renames are paused |
| CI | `.github/workflows/ci.yml` | On every pull request and push to `main`: types, unit tests, build, secret scan, and the database checks against a fresh PostgreSQL 16 |

## Running the checks locally

```bash
npm ci
```

```bash
npm run typecheck && npm test && npm run build && npm run check:secrets
```

Database checks need an empty PostgreSQL database (version 15 or later):

```bash
DATABASE_URL=postgresql://postgres@localhost:5432/crevant_test npm run test:db
```

## Brand strings outside `src/brand.ts`

If the product is ever renamed, update these alongside `src/brand.ts`:

- `index.html`: page title, meta description, theme colour
- `public/favicon.svg`
- `src/components/Wordmark.tsx`: the logo mark drawing
- Supabase Auth email templates and the sender name (added in Phase 1)
- Landing page copy (added in Phase 1)

## Founder steps this phase depends on

1. **Protect the demo before anything merges to `main`.** In the existing Crevant Vercel project: Settings, Git, Production Branch, set to `demo`. Until this is done, merging pilot work to `main` would change the live demo.
2. Create the staging accounts from the setup checklist (`docs/BETA-MIGRATION-PLAN.md`, section 22): a free Supabase project `crevant-staging`, a Mux staging environment, and a Vercel Pro project `crevant-pilot` linked to this repository.
3. Start the Stripe platform application.

When the staging accounts exist, Phase 0 finishes by applying this migration to `crevant-staging` and pointing Vercel preview deployments at it. Secrets will be requested through a secure form, never in chat.

## Not in this phase

No tables, features, sign in, payments, or analytics yet. Those start in Phase 1.
