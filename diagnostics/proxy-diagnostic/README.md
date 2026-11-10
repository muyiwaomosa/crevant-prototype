# A3 proxy diagnostic (temporary, staging only)

**Status: built and tested locally. Not deployed.** Deploying it, setting its secrets, the hosted test and its deletion each need the founder's explicit approval at the time.

This code is never merged into `main`. It lives on the branch `claude/a3-proxy-diagnostic`. Its pull request targets the separate base branch `a3-review-base`, not `main`, so merging it by mistake could never put it into `main`. Everything is under `diagnostics/`, outside `supabase/functions`, so main's permanent guard (`scripts/waitlist-isolation.test.mjs`) is unchanged and still passes. This branch's own CI job also fails if it changes anything outside `diagnostics/` and its own workflow file.

Design and threat model: `docs/PROXY-DIAGNOSTIC-THREAT-MODEL.md` (on `main`). The differences from that design are listed at the end.

## What it is for

The waitlist function rate limits by the visitor's address. It takes that address from one `X-Forwarded-For` entry: the one Supabase's own proxies add, `WAITLIST_TRUSTED_PROXY_HOPS` counted from the right. It stays closed until that number is confirmed. This diagnostic measures the number on staging (hosted staging check 3).

## What it does

**For each request that passes every check,** it reports how the `X-Forwarded-For` header arrived, without revealing any address:
* how many entries there are;
* for the rightmost eight positions, what each entry is:
  * its kind: `ipv4`, `ipv6`, `malformed` or `empty`;
  * its scope: `public`, `internal`, or `documentation` (the reserved test ranges you use for forged values);
  * whether it **equals the address you say you have** (sent in `X-Diag-Your-Address`), and for IPv6 whether it is in the same /64;
* the same yes or no answers for `X-Real-IP`, `CF-Connecting-IP` and `True-Client-IP`, and whether `Forwarded` is present;
* a **suggested hop count**: the smallest position that equals your address, with only platform entries to its right. This is a hint, not the decision.

**It never returns, logs or stores** an address, a header value, the token or a key. Each request leaves one log line, `{"event":"diag","status":200}` or `404`.

**Every other request** gets the same bare `404` with no body. That covers:
* the switch off;
* a missing or wrong setting;
* outside its time window;
* any project but staging;
* a missing or wrong token;
* no Supabase key header;
* anything but `GET`.

**It has no database connection, makes no outgoing request, imports nothing, and reads only its own settings.**

## How it is authenticated

1. **Supabase's own key check:** the deploy folder's `config.toml` keeps JWT verification on. Supabase's gateway refuses a request that doesn't carry the project's public key. The function also refuses anything without a Supabase key header.
2. **The diagnostic token:** 32 random bytes (43 characters, base64url), made on your computer for this test only. It is sent as `X-Diag-Token`. Supabase stores only its SHA-256 hash, as `DIAG_TOKEN_SHA256`, so the token itself is never stored anywhere. The function hashes the token it receives and compares the two hashes in constant time.
3. **Switch and time window:** `DIAG_ENABLED` must be exactly `true`. `DIAG_ACTIVATED_AT` and `DIAG_EXPIRES_AT` must be UTC times (like `2026-11-12T15:00:00Z`) no more than 24 hours apart, and the current time must fall between them. After the expiry it refuses by itself.
4. **Staging only:** it refuses unless Supabase reports its project as `https://kpudeppgokpjhvaqrprn.supabase.co`.

## Tests (local, and in this branch's CI job)

* `npx vitest run --config diagnostics/vitest.config.ts`: 23 unit tests. They cover:
  * configuration: off by default, staging only, malformed or out-of-window times, more than 24 hours, before activation and after expiry;
  * authentication: missing, wrong, short (even with a matching hash) or malformed tokens, no Supabase key header, the token in the wrong header, constant-time comparison;
  * forged, multiple, duplicate-line, IPv4, IPv6, internal, documentation, malformed, empty, missing and oversized headers;
  * that no response holds an address, a header value, the token or a key.
* `diagnostics/proxy-diagnostic/e2e.sh`: 28 checks in Supabase's Edge runtime. It runs four instances: good, off, another project, and one expiring after 40 seconds. It covers:
  * every refusal being an identical bare 404;
  * the reports;
  * raw duplicate header lines;
  * automatic refusal after expiry;
  * logs holding only `{event, status}`.
* `node --test diagnostics/proxy-diagnostic/guard.test.mjs`: isolation guards. The diagnostic:
  * holds one deploy folder with key checks on;
  * reads only its own settings;
  * has no imports, requests, connections, files or storage;
  * logs one fixed line;
  * compares the token as a digest, in constant time;
  * returns one refusal response;
  * has a staging-only procedure.

---

# Procedures (each needs approval at the time)

Everything below runs in **PowerShell on your Windows PC**, in one window that stays open from step 3 to step 9. That window holds the token, and closing it destroys the token.

Rules throughout:
* never paste the token, a key, a connection string or an address into chat, an issue or a commit;
* the reports themselves hold no addresses, so they are safe to share.

## 1. Before you start

* No waitlist secrets should exist yet on the staging project. In the dashboard, open **Edge Functions**, then **Secrets**, and check that there is no `WAITLIST_DB_URL` or `TURNSTILE_SECRET_KEY`. Supabase secrets are shared by every function in a project, so this keeps the diagnostic's environment free of them. The diagnostic never reads them either way.
* Node.js must be installed (for `npx`). Git must be installed.

## 2. Get exactly the reviewed code

```powershell
git clone https://github.com/muyiwaomosa/crevant-prototype.git C:\crevant\a3
```

```powershell
cd C:\crevant\a3; git checkout <the reviewed commit>; git log -1 --format=%H
```

The last command must print the reviewed commit. If it doesn't, stop.

## 3. Sign in to Supabase (opens your browser)

```powershell
npx supabase@2.122.1 login
```

## 4. Deploy it, switched off

No secrets are set yet, so it answers 404 to everything. Name the function every time, and never use the option that deletes other functions.

```powershell
npx supabase@2.122.1 functions deploy proxy-diagnostic --project-ref kpudeppgokpjhvaqrprn --workdir C:\crevant\a3\diagnostics\proxy-diagnostic\deploy --use-api
```

Set up a helper that reports only status codes:

```powershell
$u = "https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/proxy-diagnostic"
function Probe($h) { try { (Invoke-WebRequest -Uri $u -Headers $h -UseBasicParsing).StatusCode } catch { $_.Exception.Response.StatusCode.value__ } }
```

```powershell
Probe @{}
```

**Expect `401`.** That is Supabase's own key check refusing a request without the public key, which proves JWT verification is on. If you get anything else, go to step 9.

Paste the project's public key. It's on the dashboard under **Project Settings**, then **API Keys**: the legacy `anon` key, or the publishable key. It's public, but keep it out of your history anyway:

```powershell
$key = Read-Host "Paste the project's public key"
```

```powershell
Probe @{ Authorization = "Bearer $key"; apikey = $key }
```

**Expect `404`:** past Supabase's check, and the diagnostic is still off.

## 5. Create the short-lived token and the time window

This makes 32 random bytes with Windows' own cryptography. The token stays in this window only and is never shown. Only its hash goes to Supabase.

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$hash = -join ([System.Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::ASCII.GetBytes($token)) | ForEach-Object { $_.ToString('x2') })
$start = (Get-Date).ToUniversalTime()
$activated = $start.ToString("yyyy-MM-ddTHH:mm:ssZ")
$expires = $start.AddHours(4).ToString("yyyy-MM-ddTHH:mm:ssZ")
```

Four hours is enough for the test. The diagnostic refuses any window longer than 24 hours.

## 6. Set the secrets, switch last

In the dashboard, open **Edge Functions**, then **Secrets**, and add each secret below. To fill in a value, run its line in PowerShell, then paste into the dashboard:

| Secret name | Value (copied with) |
|---|---|
| `DIAG_TOKEN_SHA256` | `$hash \| Set-Clipboard` |
| `DIAG_ACTIVATED_AT` | `$activated \| Set-Clipboard` |
| `DIAG_EXPIRES_AT` | `$expires \| Set-Clipboard` |
| `DIAG_ENABLED` | type `true`, **last** |

Check that it answers now. If it still says 404 after a minute, run the deploy command from step 4 again.

```powershell
Probe @{ Authorization = "Bearer $key"; apikey = $key; 'X-Diag-Token' = $token }
```

**Expect `200`.**

## 7. Test from two independent networks

The same laptop on two different networks is fine. For example:
* **Network A:** your home Wi-Fi.
* **Network B:** your phone's hotspot on mobile data, not Wi-Fi.

On each network, first find your own public address. The address stays in this window, and the reports never repeat it:

```powershell
$me = Invoke-RestMethod https://api.ipify.org
```

Then run the four requests:

```powershell
function Diag($xff) { $h = @{ Authorization = "Bearer $key"; apikey = $key; 'X-Diag-Token' = $token; 'X-Diag-Your-Address' = $me }; if ($xff) { $h['X-Forwarded-For'] = $xff }; Invoke-RestMethod -Uri $u -Headers $h | ConvertTo-Json -Depth 6 }
```

```powershell
Diag $null
```

```powershell
Diag "198.51.100.7"
```

```powershell
Diag "198.51.100.7, 203.0.113.9"
```

```powershell
Diag "not-an-address"
```

**IPv6 (if your connection has it):** `$me6 = Invoke-RestMethod https://api6.ipify.org`. If that works, set `$me = $me6` and repeat the four requests. The reports show whether the request reached Supabase over IPv6: look for `ipv6` at the matching position.

Save each report. They hold only kinds and yes or no answers, so they are safe to share.

## 8. Decide the trusted hop count

Set `WAITLIST_TRUSTED_PROXY_HOPS = k` only if **every** report, on **both** networks, agrees on all of these:

1. Position `k` has `matches_your_address: true`. Your own address arrives there on network A, and network B's address arrives there on network B.
2. `suggested_trusted_hops` is `k` in every report.
3. Every forged value (`documentation` scope, `malformed`) sits **left** of position `k`, never at or right of it.
4. The positions right of `k`, if any, are the same kind in every report (the platform's own proxies).

**Stop, and don't set anything, if:**
* any report disagrees;
* no position matches your address. This would happen if, for example, Supabase replaces the header or puts the address only in `X-Real-IP`; the reports show which;
* a forged value appears at or right of the matching position.

In each case, report what you saw. The waitlist function stays closed meanwhile, which is safe.

## 9. Disable, delete, and confirm it's gone (the same session)

1. **Switch off** at once. In **Edge Functions**, then **Secrets**, delete `DIAG_ENABLED`. Then check:

   ```powershell
   Probe @{ Authorization = "Bearer $key"; apikey = $key; 'X-Diag-Token' = $token }
   ```

   **Expect `404`.**
2. **Delete the function:**

   ```powershell
   npx supabase@2.122.1 functions delete proxy-diagnostic --project-ref kpudeppgokpjhvaqrprn
   ```
3. **Delete its temporary secrets:**

   ```powershell
   npx supabase@2.122.1 secrets unset DIAG_ENABLED DIAG_TOKEN_SHA256 DIAG_ACTIVATED_AT DIAG_EXPIRES_AT --project-ref kpudeppgokpjhvaqrprn
   ```
4. **Confirm it's gone:**
   * `Probe` with the token again: **expect `404`**. The function no longer exists.
   * Run the two commands below and check that `proxy-diagnostic` isn't listed in the first, and no `DIAG_` secret is listed in the second.

   ```powershell
   npx supabase@2.122.1 functions list --project-ref kpudeppgokpjhvaqrprn
   ```

   ```powershell
   npx supabase@2.122.1 secrets list --project-ref kpudeppgokpjhvaqrprn
   ```
5. **Clean up your PC:** run `Remove-Variable token, hash, bytes, key, me -ErrorAction SilentlyContinue`, then `npx supabase@2.122.1 logout`, close this PowerShell window, and delete `C:\crevant\a3`.
6. **Afterwards, with approval:**
   * close the A3 pull request unmerged;
   * delete the branches `claude/a3-proxy-diagnostic` and `a3-review-base`;
   * record the hop count and the date in `docs/WAITLIST.md` through a normal reviewed PR.

---

## What it can and can't prove

**It can prove, for the staging project, today:**
* which `X-Forwarded-For` position holds the visitor's real address, on the networks tested;
* that values a visitor forges stay to the left of it, or are dropped;
* whether Supabase also sets `X-Real-IP` or similar headers to the visitor's address;
* whether IPv6 visitors arrive intact, if tested over IPv6.

**It can't prove:**
* **Production.** Production will be a separate Supabase project, likely in another region (Canada Central was proposed, staging is in us-west-2), and possibly on another plan. Its gateway and network path may differ. **Repeat this test on Production before Production's waitlist opens**, as a separate approval: the code refuses any project but staging, so that needs a reviewed change.
* **The future.** Supabase can change its proxies at any time, and nothing in the waitlist function can detect that. Repeat this test after any Supabase notice about its gateway or network.
* **That `join-waitlist` receives the very same header.** It's very likely, since it's the same project, gateway and path (browsers call the function directly; Vercel doesn't proxy it), but it's an inference.
* **Every network.** Two networks give confidence, not certainty. A visitor behind an unusual proxy may look different. The waitlist function stays safe in that case, because it puts an untrusted or internal address in the shared bucket.
* **Anything about** Turnstile, the database, TLS or the rate limits themselves.

## Differences from the threat model, and why

* **The token goes in `X-Diag-Token`, not `Authorization`.** Supabase's key check uses `Authorization`.
* **Supabase stores only the token's SHA-256 hash.** The token never leaves your PC except in your requests.
* **An activation time as well as an expiry**, at most 24 hours apart. An expiry set far in the future can't make a window that opens later.
* **No fingerprints.** Instead you send your own address, and the diagnostic answers only "equal or not". That needs no extra key, and leaves nothing that could ever be reversed.
* **Staging only, in code:** it refuses any other project.
* **The pull request targets `a3-review-base`, not `main`.**

## Assumptions to confirm during the test

Each one fails safe if wrong:
* **That deploying with `--use-api` works on Windows without Docker.** If not, the deploy fails and nothing is deployed.
* **That the gateway refuses a request with no key (`401`).** Step 4 checks this. If it doesn't, delete the function (step 9) and stop.
* **That new secrets reach the function without a redeploy.** Step 6 redeploys if needed.
* **That `SUPABASE_URL` is exactly the staging address.** If not, the diagnostic refuses everything (404) and nothing is learned. Stop and report.
* **That the publishable key alone passes the key check.** If not, use the legacy `anon` key. Both are public.
