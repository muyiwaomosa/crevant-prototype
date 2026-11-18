# Waitlist export and recovery (Supabase Free)

The Production project (`hmrliwoychnqrbbydorg`) stays on the Free plan until
the app launches, by founder decision. Free has no restorable backups, so the
founder keeps an encrypted export of the waitlist outside Supabase.

## What is exported

The data in the `ops` schema, which is the waitlist and everything tied to
it: entries, consent records, invitations, the switches, and the hourly
counts. **Not** the rate limit tables (`ops.waitlist_rate_limits`,
`ops.invite_preview_limits`), which expire in two days anyway. No schema: the
schema comes from the migrations, so a restore always starts from the
reviewed migration workflow.

## Cadence

* **Weekly**, on a fixed day, while the waitlist is open.
* **Before** any Production migration (`apply`).
* **Keep the last four** exports and delete older ones, so a deleted entry
  leaves the exports within about four weeks.

## Export (Windows PowerShell, about two minutes)

Needs the PostgreSQL 17 tools, 7-Zip (`winget install --id 7zip.7zip -e`), and
Supabase's CA at `C:\crevant\supabase-ca.crt`. `pg_dump` prompts for the
Production database password; it is never typed into a command.

```powershell
$d = Get-Date -Format yyyy-MM-dd
```

```powershell
pg_dump "host=<pooler host> port=5432 dbname=postgres user=postgres.hmrliwoychnqrbbydorg sslmode=verify-full sslrootcert=C:\crevant\supabase-ca.crt" --data-only --schema=ops --exclude-table-data=ops.waitlist_rate_limits --exclude-table-data=ops.invite_preview_limits -Fc -f "C:\crevant\waitlist-$d.dump"
```

Encrypt it with a separate export password from your password manager
(AES-256, file names hidden too), then delete the unencrypted file:

```powershell
& "C:\Program Files\7-Zip\7z.exe" a -t7z -mhe=on -p "C:\crevant\waitlist-$d.7z" "C:\crevant\waitlist-$d.dump"
```

```powershell
Remove-Item "C:\crevant\waitlist-$d.dump"
```

7-Zip asks for the password twice. Move the `.7z` file to your chosen
storage outside Supabase (for example a private cloud drive folder). Only
the encrypted file ever leaves your computer.

## Recovery (only if Production data is lost)

1. Get a working, empty Production database: the same project, or a new one
   after a reviewed PR updates the project reference.
2. Run the Production database workflow: `plan`, `apply`, `check`. This
   rebuilds the schema from the six approved migrations.
3. Decrypt the newest export with 7-Zip, then restore the data:

   ```powershell
   pg_restore --data-only --single-transaction -d "host=<pooler host> port=5432 dbname=postgres user=postgres.hmrliwoychnqrbbydorg sslmode=verify-full sslrootcert=C:\crevant\supabase-ca.crt" "C:\crevant\waitlist-<date>.dump"
   ```

   Delete the decrypted `.dump` file afterwards.
4. Run the admin workflow's `summary` and compare the counts with the last
   ones you noted. The waitlist stays closed until you `open` it again.

Entries deleted on request after the export was taken come back with a
restore. Keep a private list of deletion dates and waitlist IDs (never email
addresses) and delete those IDs again after any restore.
