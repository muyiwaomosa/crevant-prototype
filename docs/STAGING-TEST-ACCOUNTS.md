# Staging test accounts

Four test accounts on the Crevant **staging** Supabase project (`crevant-staging`, reference `kpudeppgokpjhvaqrprn`), so Milestone 1 features can be tried with several members on the Vercel Preview. Workflow: `.github/workflows/staging-test-accounts.yml`, named **Staging test accounts**. Script: `scripts/staging-test-accounts.mjs`.

It can only ever touch staging. Production and the `demo` branch are never involved. It never changes Supabase Auth settings: public sign-up stays disabled and every real member still joins by invitation.

## What it does

| Mode | What happens |
| --- | --- |
| `plan` (default) | Read-only. Runs every check and reports, for test accounts 1 to 4, whether each exists. Changes nothing. |
| `create` | Creates any missing test accounts with a confirmed email and the approved password, tagged as test accounts. Running it again creates nothing new. |
| `delete` | Removes an account, with its profile, only if it carries the test tag **and** its address exactly matches one of the four approved addresses. Tagged accounts with any other address are reported and never deleted. |

Each new account then goes through onboarding like any member.

## Safeguards

* Runs only from `main`, in the `staging` GitHub environment, which waits for the founder's approval before it can read any secret.
* The one project it may touch is hard-coded in the workflow. The `SUPABASE_PROJECT_REF` variable and the reference typed when running it must both match, or it stops before contacting anything.
* A server key from another project is refused: legacy keys name their project, and any key the staging project doesn't recognise fails before any change.
* It refuses to run if public sign-up is enabled, and checks again after any change.
* Test accounts are tagged in `app_metadata` (`crevant_staging_test_account: true`), which only server code can set; a member cannot add or remove it (tested). `create` stops, changing nothing, if an approved address already belongs to a real account. `delete` requires both the tag and an exact match with an approved address, so it can never remove a real account or any account outside the approved list.
* Addresses, the password and the key are masked. The log only ever says "test account 1" to "test account 4", with counts and statuses.
* CI tests the script on every pull request: self tests with a recording fake, and the full create, refuse and clean-up cycle against a real local Supabase. Guard tests fail if the workflow loses any of the safeguards above.

## One-time setup (founder, in GitHub)

In Settings, Environments, `staging` (the environment already used for database deployment, with `main` only and required reviewers), add three **environment secrets**. Paste them only into GitHub, never into chat, email or a file.

1. `STAGING_SERVICE_ROLE_KEY`: a Supabase **secret key** for `crevant-staging` (Supabase dashboard, Project Settings, API Keys). Creating a separate secret key just for this workflow lets you revoke it on its own later. Never use a publishable key, and never a key from another project.
2. `STAGING_TEST_ACCOUNT_EMAILS`: exactly four approved addresses, separated by commas or new lines. Addresses you control are best, for example plus addresses on your own mailbox.
3. `STAGING_TEST_ACCOUNT_PASSWORD`: one password for all four test accounts, at least 12 characters, not containing any of the addresses.

The existing `SUPABASE_PROJECT_REF` variable (`kpudeppgokpjhvaqrprn`) is reused.

## Running it

Actions, **Staging test accounts**, **Run workflow**:

1. Branch: `main`.
2. Mode: `plan` first.
3. Confirm project reference: type `kpudeppgokpjhvaqrprn`.
4. Approve the `staging` environment when GitHub asks.
5. If the plan shows four accounts "not created", run again with mode `create`.

## Cleaning up

Before the pilot opens, or whenever test accounts are no longer needed, run mode `delete` **before** changing the address list: it only removes accounts whose address is still on the list. If a tagged account is reported as "not on the approved list" (for example, after the list was changed), review and remove it by hand in the Supabase dashboard (Authentication, Users). Deleting an account removes its profile as well.

If the key may have leaked, revoke it in the Supabase dashboard and replace the secret.
