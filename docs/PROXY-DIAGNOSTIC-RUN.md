# Running the proxy diagnostic (hosted staging check 3)

**This branch (`claude/proxy-diagnostic`) is never merged.** Deploy from its pinned, reviewed commit, run the test, delete the function and its secrets in the same session, then close the PR unmerged. Design and threat model: `docs/PROXY-DIAGNOSTIC-THREAT-MODEL.md`. Staging only (`kpudeppgokpjhvaqrprn`). Never Production.

One change from the design: the diagnostic token goes in an `X-Diagnostic-Token` header, not `Authorization`, because Supabase's own JWT check reads `Authorization` (it carries the project's public key). Everything else is as designed.

## Rules

* The token never goes in chat, an issue, a commit, a file or a command line. PowerShell reads it from a hidden prompt.
* The answers contain no addresses, only kinds (IPv4 or IPv6, public or private, or "the test value") and short fingerprints. Those are safe to share.
* Don't deploy with `--no-verify-jwt`.

## 1. Set up (PowerShell, on your computer)

1. Install the Supabase CLI if needed, then sign in through the browser. No access token is stored anywhere:

   ```powershell
   supabase login
   ```
2. In a clone of the repository, check out the reviewed commit named in the PR (replace `<commit>`):

   ```powershell
   git fetch origin claude/proxy-diagnostic
   ```

   ```powershell
   git checkout <commit>
   ```
3. Make a new random token of 40 characters or more in your password manager.
4. In the Supabase dashboard for **staging**, open Edge Functions, then Secrets, and add:
   * `DIAG_ENABLED` = `true`
   * `DIAG_TOKEN` = the token
   * `DIAG_EXPIRES_AT` = a UTC time a few hours from now, written like `2026-11-18T03:00:00Z`. More than 24 hours away and the diagnostic stays off.

## 2. Deploy

```powershell
supabase functions deploy proxy-diagnostic --project-ref kpudeppgokpjhvaqrprn
```

## 3. Test

Find the project's public (anon) key under Project Settings, API keys. It isn't a secret. Then, in the same PowerShell window:

```powershell
$url = "https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/proxy-diagnostic"
$key = Read-Host "Public anon key"
$tok = [System.Net.NetworkCredential]::new("", (Read-Host "Diagnostic token" -AsSecureString)).Password
function Diag($xff) {
  $h = @{ Authorization = "Bearer $key"; apikey = $key; "X-Diagnostic-Token" = $tok }
  if ($xff) { $h["X-Forwarded-For"] = $xff }
  Invoke-RestMethod -Uri $url -Headers $h | ConvertTo-Json -Depth 5 -Compress
}
```

Run these on your **home internet**, then again on **phone data** (a hotspot), and save the six lines of output:

```powershell
Diag $null
```

```powershell
Diag "198.51.100.7"
```

```powershell
Diag "198.51.100.7, 203.0.113.9"
```

Also check that it refuses a wrong token. This must print a 404 error:

```powershell
Invoke-WebRequest -Uri $url -Headers @{ Authorization = "Bearer $key"; apikey = $key; "X-Diagnostic-Token" = "wrong" }
```

Finally, clear the token from the window:

```powershell
Remove-Variable tok
```

## 4. Remove it, straight away

```powershell
supabase functions delete proxy-diagnostic --project-ref kpudeppgokpjhvaqrprn
```

```powershell
supabase secrets unset DIAG_ENABLED DIAG_TOKEN DIAG_EXPIRES_AT --project-ref kpudeppgokpjhvaqrprn
```

Then confirm the address answers 404 and the dashboard no longer lists the function. Delete the token from your password manager.

## 5. Reading the answers

Let **N** be `entries` from `Diag $null`.

The hop count is **N** if all of these hold:
* In `Diag $null`, the position with `fromRight` = N is `ipv4_public` or `ipv6_public`.
* Its fingerprint is the same in every answer from one network, and different between home internet and phone data.
* Position N's fingerprint is the same with and without the forged values (on the same network).
* The forged test value is either missing (`testValueFromRight` is null, so Supabase drops what visitors send) or further left (N + 1, or N + 2 with two forged entries). It never sits at position N or to its right.

If any of these fail, stop and report. Don't guess a number. Share the six output lines and the 404 result.
