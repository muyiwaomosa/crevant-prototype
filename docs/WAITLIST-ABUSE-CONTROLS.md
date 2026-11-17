# Waitlist abuse controls without visitor addresses

**Status:** proposed for the initial public waitlist. Needs the founder's
approval. It is chosen with the function setting `WAITLIST_CLIENT_ADDRESS=ignore`
(and no `WAITLIST_TRUSTED_PROXY_HOPS`).

## The decision

The per-visitor limit (10 submissions an hour per address) is the only
control that needs the visitor's network address. That address can only be
read from `X-Forwarded-For`, at a position that depends on Supabase's proxies
(the hop count). A wrong hop count is unsafe either way: too high and a
visitor can forge their way round the limit; too low, or a missing header,
and every visitor shares one bucket of 10 an hour, which would quietly cap the
whole launch.

For the initial waitlist we **switch the per-visitor limit off** rather than
trust a header we can't measure reliably, and rely on the controls below. No
other address header is used instead.

**How it is switched off, and why that is not a control.** The database
requires a client key with every submission and limits each key to 10 an
hour. In `ignore` mode the function gives every request a fresh random key,
so no key is ever reused and that limit never triggers. This is only a way to
turn the limit off without a database change. It provides no protection by
itself, and the rest of this document doesn't count it as one.

## The controls that remain

| Control | Where | What it stops |
| --- | --- | --- |
| Cloudflare Turnstile, verified on the server for every submission: success, an allowed hostname (`www.splitpost.ca`) and the action `join`. Tokens are single use and short lived | Function | Scripts that don't run a real browser challenge. Each submission costs the sender one solved challenge. Tokens from other sites don't work |
| 3 submissions a day per email address (salted key) | Database | Hammering one address |
| 60 submissions a minute in total | Database | Any flood, whatever its source: a hard ceiling on write volume |
| One entry per address (unique constraint); a repeat changes nothing and reveals nothing | Database | Duplicates, overwriting someone's answers, finding out who has joined |
| Honeypot field | Function | Simple form-filling bots (answers ok, stores nothing) |
| Allowed origin, JSON only, 4 KB limit | Function | Casual cross-site use and oversized requests |
| No invitation for an unverified address (enforced in the database) | Database | Junk entries ever becoming pilot accounts |
| No email is sent at launch | Design | Using the form to send mail to other people |
| The `close` action, and the function switch | Admin workflow, Supabase secrets | Any attack in progress: submissions stop at once |

## How each kind of abuse is handled

**1. Simple automated submissions.** A script posting to the function has no
valid Turnstile token, so it gets `verification_failed` and nothing is
stored. A bot filling the page's form trips the honeypot or fails the
challenge.

**2. Bots that solve Turnstile (solving services, or people paid to click).**
This is the real risk. Each submission needs its own solved challenge, which
costs the attacker money and time, and the totals are capped at 60 a minute
(at most 86,400 entries a day, in theory). The entries are unverified, so they
can never be invited. The harm is junk in the list and in the counts, not a
data breach or a compromised account.

**3. Distributed abuse (many addresses).** The per-visitor limit wouldn't
stop this either: an attacker with many addresses gets 10 an hour from each.
The overall limit and Turnstile's cost are what bound it, with or without the
per-visitor limit.

**4. Exhausting the overall limit (denial of service).** An attacker who keeps
up 60 solved submissions a minute fills the overall limit, and real visitors
see "Too many attempts. Please try again later." This is an availability
problem only: nothing is exposed and no real entry is changed. It's the main
risk this decision accepts. A per-visitor limit would make it slightly harder
for an attacker with one address, and no harder for one with many.

**5. Adding other people's addresses.** Anyone can type an address that isn't
theirs, with or without this change. No email is sent, so the person isn't
contacted. They can ask for deletion, and verification will come before any
invitation.

**6. Storage growth.** Waitlist rows are bounded by the overall limit. Rate
limit rows in `ignore` mode are one random client key per accepted request,
also bounded by the overall limit, and deleted after two days.

**7. Invitation link previews.** The preview needs no Turnstile. In `ignore`
mode its per-visitor limit (30 an hour) is off too, and its overall limit (300
a minute) remains; it stores nothing about visitors. Repeat visits are no
longer counted once a day, so link visit counts read high. No creator links
are planned for launch, so this doesn't apply until links are issued.

## Detection and response

* **Watch:** the admin `summary` action shows totals (verified and unverified
  apart). Check it daily for the first two weeks. The function's logs show
  response codes only, so a run of 429s (`rate_limited`) or a sudden jump in
  entries is the signal.
* **Respond:** run the `close` action, or turn `WAITLIST_FUNCTION_ENABLED`
  off. The form then says "The waitlist isn't open right now."
* **Clean up:** junk entries are unverified and can't be invited. Individual
  entries can be removed with the `delete` action. **There is no bulk removal
  tool for a spam wave yet.** If one happens, removing entries by time range
  needs a reviewed one-off script, run as the database owner. Building that
  tool is recommended after launch, not before.
* **Reopen:** after cleanup, `open` again. If it keeps happening, the options
  are: confirm the hop count (hosted check 3) and switch the per-visitor limit
  back on, or put a managed firewall rate limit in front of the function.

## Why this is the simplest acceptable design

* It removes the one unverifiable assumption (the hop count) without adding a
  service.
* Every remaining control is already built and tested, and none depends on
  anything a visitor can forge.
* The accepted risks (junk unverified entries, and a paid attacker making the
  form unavailable for a while) have no privacy or security consequence, can
  be seen, and can be stopped at once with `close`.
* It stores less about visitors: nothing derived from their network address.

**Revisit** if junk entries or 429s appear in practice, before issuing
creator links at scale, or before invitations are sent.

## Tests

* `supabase/functions/join-waitlist/handler.test.ts`, the "client address mode"
  tests: the setting needs an explicit, consistent choice; `ignore` never reads
  the header; every request gets its own key, never the shared one; the
  per-email key is unchanged; hop count mode is unchanged.
* `scripts/e2e/waitlist-edge.sh` (Edge runtime, local database, also in CI),
  section 9d and the real entry point checks: no per-visitor limit; no shared
  bucket without a header; per-email, overall, Turnstile, hostname, origin,
  honeypot and repeat behaviour all unchanged; the real entry point starts in
  `ignore` mode, and `ignore` with a hop count stays closed and logs why.
* `scripts/waitlist-isolation.test.mjs`: no default for either setting, the
  forwarding header is read in one place only and only through `clientIpFor`,
  and no other address header is read.
