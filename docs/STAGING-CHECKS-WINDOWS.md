# Hosted staging checks on Windows

Status: **instructions only. Don't run any of this until each step is approved.** They cover setting the two waitlist login passwords and hosted staging checks 1 and 2 (`docs/WAITLIST.md`). Check 3, the proxy hop count, needs the temporary diagnostic in A3 (`docs/PROXY-DIAGNOSTIC-THREAT-MODEL.md`).

Everything uses PostgreSQL's own `psql` and Windows' own tools. No custom code creates or handles passwords.

## Rules for every step

* **Never put a password in a command, a connection string, a file or an environment variable** (no `PGPASSWORD`). `psql` asks for it, and nothing you type at that prompt is shown or kept in PowerShell's history.
* **Never paste a password, connection string or key into a chat, an issue or a commit.** To report a result, share only the PASS or FAIL lines below, or an error message with any address removed.
* **Never weaken TLS.** Every command uses `sslmode=verify-full`, which checks both the certificate and the host name. Never use `require`, `prefer`, `allow` or `disable`. If a check fails, stop and report it.

## One-time setup

1. **Install the PostgreSQL command line tools** (version 16 or later). Either:
   * the installer from postgresql.org (Windows, "Download the installer"), ticking only **Command Line Tools**; or
   * in PowerShell: `winget search PostgreSQL`, then `winget install` with the ID it lists for version 17.
2. **Make `psql` available** in this PowerShell window, and check its version:

   ```powershell
   $env:Path += ";C:\Program Files\PostgreSQL\17\bin"
   ```

   ```powershell
   psql --version
   ```
3. **Make a working folder:**

   ```powershell
   New-Item -ItemType Directory -Force C:\crevant
   ```
4. **Download Supabase's CA certificate** for the staging project: in the Supabase dashboard, open the project's database settings and find **SSL Configuration**, then **Download certificate**. Save it as `C:\crevant\supabase-ca.crt`. It's a public certificate, not a secret. (Supabase's dashboard layout changes from time to time; the button may sit elsewhere.)
5. **Find the pooler host name:** in the dashboard, choose **Connect** and look at the pooler connection details. The host looks like `aws-0-us-west-2.pooler.supabase.com`. Below it's written `<pooler host>`. Copy only the host name, not the full connection string.

## A. Set the two login passwords (needs approval)

Generate two new random passwords (32 characters or more) in your password manager first.

1. Connect as the database owner through the session pooler (port 5432). psql asks for the database password from your password manager:

   ```powershell
   psql "host=<pooler host> port=5432 dbname=postgres user=postgres.kpudeppgokpjhvaqrprn sslmode=verify-full sslrootcert=C:\crevant\supabase-ca.crt"
   ```

   On connecting, psql prints a line starting `SSL connection (protocol: TLSv1.`. If it doesn't, type `\q` and stop.
2. Set each password. psql asks for it twice and turns it into a SCRAM verifier on your computer, so the password itself never reaches the server or its logs:

   ```
   \password waitlist_writer
   ```

   ```
   \password waitlist_admin
   ```
3. Leave with `\q`.

Then store the `waitlist_writer` password only where it's used: the function secret `WAITLIST_DB_URL`, set in the Supabase dashboard (Edge Functions, Secrets), after approval. The `waitlist_admin` password goes only into the GitHub `staging` environment secret `WAITLIST_ADMIN_DATABASE_URL`.

## B. Hosted check 1: the pooler accepts the restricted login

1. Connect as `waitlist_writer` through the transaction pooler (port 6543). psql asks for the `waitlist_writer` password:

   ```powershell
   psql "host=<pooler host> port=6543 dbname=postgres user=waitlist_writer.kpudeppgokpjhvaqrprn sslmode=verify-full sslrootcert=C:\crevant\supabase-ca.crt"
   ```
2. Run these three lines one at a time:

   ```sql
   select current_user;
   ```

   ```sql
   select count(*) from ops.waitlist;
   ```

   ```sql
   select waitlist_api.submit(null, null, null, null, null, null, null, null, null, null, null);
   ```
3. Expected, all three:
   * `current_user` is `waitlist_writer`
   * the count is refused: `permission denied for schema ops` (or for the table)
   * the call answers `closed`, because submissions are off. Nothing is stored.

**PASS** if all three match. **If the pooler refuses the login, stop.** Record the error message (without the host) and report it. Never try a broader login instead.

## C. Hosted check 2: full certificate verification

Step B already connected with `sslmode=verify-full`, so the right certificate and host name were verified. These checks prove that the wrong ones are refused.

1. **Wrong host name.** Look up one of the pooler's addresses, then connect to the address instead of the name. The certificate is issued to the name, so this must fail:

   ```powershell
   Resolve-DnsName <pooler host> -Type A
   ```

   ```powershell
   psql "host=<one of the addresses shown> port=6543 dbname=postgres user=waitlist_writer.kpudeppgokpjhvaqrprn sslmode=verify-full sslrootcert=C:\crevant\supabase-ca.crt"
   ```

   Expected: an error saying the server certificate doesn't match the host name, **before** any password prompt.
2. **Wrong certificate authority.** Make a throwaway certificate authority with Windows' own tools, use it, then delete it:

   ```powershell
   $c = New-SelfSignedCertificate -Subject "CN=Crevant wrong CA" -CertStoreLocation Cert:\CurrentUser\My -KeyUsage CertSign
   ```

   ```powershell
   Export-Certificate -Cert $c -FilePath C:\crevant\wrong-ca.cer
   ```

   ```powershell
   certutil -encode C:\crevant\wrong-ca.cer C:\crevant\wrong-ca.crt
   ```

   ```powershell
   psql "host=<pooler host> port=6543 dbname=postgres user=waitlist_writer.kpudeppgokpjhvaqrprn sslmode=verify-full sslrootcert=C:\crevant\wrong-ca.crt"
   ```

   Expected: `certificate verify failed`, before any password prompt. Then remove it:

   ```powershell
   Remove-Item $c.PSPath; Remove-Item C:\crevant\wrong-ca.*
   ```
3. **Is the certificate publicly trusted?** (This decides whether the staging rollback workflow can verify it without a CA file.)

   ```powershell
   psql "host=<pooler host> port=5432 dbname=postgres user=postgres.kpudeppgokpjhvaqrprn sslmode=verify-full sslrootcert=system"
   ```

   If it reaches the password prompt, the certificate is publicly trusted: press Ctrl+C. If it says `certificate verify failed`, it isn't. Either answer is fine; just report which. Never connect with a weaker mode to find out.

**PASS** if steps 1 and 2 are refused, and step B connected.

## D. The function's own TLS (after the function is deployed, which needs separate approval)

The function verifies the database certificate in code; there's no setting to turn that off. Its health check shows whether it can connect, and nothing else:

```powershell
Invoke-RestMethod https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist
```

Expected: `status` is `ok`. If it's `error`, the function's logs (in the dashboard) say why in one line, such as a certificate or login problem. Then, if `WAITLIST_DB_CA_CERT` is in use, a deliberate negative test: set it to the wrong certificate from step C2 (made again), wait a minute, expect `error`, then put the right one back and expect `ok`.

## After the checks

* Delete anything you made in `C:\crevant` except `supabase-ca.crt`.
* Report the PASS or FAIL for B, C1, C2, the answer to C3, and D if it was run.
