# Phase 0: foundations

Part of the Crevant 60-day pilot plan (`docs/BETA-MIGRATION-PLAN.md`, section 17). This phase adds the groundwork every later phase builds on. It changes nothing a visitor to the demo can see, and it connects to no live service.

## What this phase adds

| Item | Where | Purpose |
| --- | --- | --- |
| Frozen demo branch | `demo` branch on GitHub, at commit `421a0a1` | Keeps the current Crevant demo exactly as it is while pilot work lands on `main` |
| Separated data areas | `supabase/migrations/20261106000000_foundations.sql` | Creates the `intent` (hypothetical Support Intent amounts), `sim` (simulated advertising) and `analytics` schemas next to `public`, locked down so members and anonymous visitors have no direct access, including to anything created there later. The pilot takes no real payments, so there is no `finance` schema |
| Separation and permission checks | `supabase/tests/001_schema_separation.sql` | Proves the schemas exist, only server code can use them, new tables start locked, and no view or function combines two amount schemas: hypothetical support (`intent`), illustrative ad earnings (`sim`), or real money (`finance`, if it is ever added). Includes negative tests that deliberate violations are caught |
| Test runner | `scripts/db/test.sh`, `scripts/db/bootstrap-roles.sql` | Applies every migration to an empty PostgreSQL database and runs the checks. The bootstrap creates Supabase's `anon`, `authenticated` and `service_role` roles for testing only |
| Secret scan | `scripts/check-bundle-secrets.sh` (`npm run check:secrets`) | Fails if a secret key pattern (Supabase secret, Mux secret, email API key, private key, and payment provider keys as a precaution) appears in the built frontend |
| Environment template | `.env.example` | Lists the public values the frontend needs and the secrets that must never be there |
| Brand configuration | `src/brand.ts` | One place for the product name. The Wordmark reads from it. Crevant stays the brand; renames are paused |
| Staging database deploy | `.github/workflows/deploy-db-staging.yml`, `docs/STAGING-DATABASE.md` | Manually started workflow that applies approved migrations to `crevant-staging` only, after target, approval list and throwaway database checks |
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

1. **Protect the demo before anything merges to `main`.** Done: the existing Crevant Vercel project's production branch is `demo` (Settings, Environments, Production, Branch Tracking), and the current production deployment is built from `demo` at `421a0a1`.
2. **Create the free Supabase staging project** `crevant-staging`. This is the only new account Phase 1 needs. Staging previews run as preview deployments of the existing Vercel project, with the staging Supabase values set as **Preview only** environment variables, so production (the demo) never receives them.
3. Later, when they are needed: Mux (Phase 2, video), an email provider on the Crevant domain, and the paid beta services before rollout (`docs/BETA-MIGRATION-PLAN.md`, sections 20 and 22).

Phase 0 finishes by applying this migration to `crevant-staging` with the staging deploy workflow (`docs/STAGING-DATABASE.md`). Secrets are never shared in chat.

## Not in this phase

No tables, features, sign in, or analytics yet. Those start in Phase 1. The pilot takes no real payments; Support Intent records nonbinding, hypothetical amounts only.
