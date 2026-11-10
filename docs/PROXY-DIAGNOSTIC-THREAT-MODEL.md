# Proxy diagnostic (A3): threat model

Status: **design only. Nothing here is built, deployed or authorized.** Building it, deploying it, its authentication, its expiry and its deletion each need the founder's separate approval. This repository's `main` branch never holds the diagnostic's code: `scripts/waitlist-isolation.test.mjs` fails if anything but `join-waitlist` appears under `supabase/functions`.

## Why it exists

The waitlist function rate limits by visitor address. It reads that address from one `X-Forwarded-For` entry: the one Supabase's own proxies add, `WAITLIST_TRUSTED_PROXY_HOPS` from the right. That number can't be known without asking the hosted platform. Until it's confirmed the function stays closed (no default). Hosted staging check 3 needs a measurement, and the diagnostic is that measurement.

## What it is

A separate, temporary Edge Function, `proxy-diagnostic`, on **staging only**:
* It shares no code with `join-waitlist`.
* It has no database connection and reads no secret except its own two settings.
* Its code lives on a reviewed branch that is **never merged**. It is deployed from that branch's pinned, reviewed commit, and the PR is closed after the test.
* It needs its own reviewed exception to the guard test, on that branch only.

## Assets

| Asset | Why it matters |
|---|---|
| Visitor IP addresses | Personal data. The diagnostic must never reveal, log or store one. |
| The header layout Supabase uses | Low sensitivity, but useful to an attacker planning to forge headers. |
| The staging project | Must not gain a lasting public endpoint. |
| The diagnostic token | Whoever has it can use the diagnostic. |

## Who could reach it

* **The founder,** with the token: the only intended user.
* **Anyone on the internet,** who can find the function's address. Supabase function addresses are predictable.
* **Supabase and its proxies,** which see all traffic anyway.

## What it reveals, and to whom

To a request with the right token only, it reveals the shape of what arrived:
* the number of `X-Forwarded-For` entries;
* for each position counted from the right, whether it is **exactly** the test value the tester sent (the documentation address `198.51.100.7`), or otherwise only whether it is IPv4 or IPv6, and public or private;
* for each position, an 8 character fingerprint: an HMAC of the entry with a random key made for that test session. It is the same for the same address and different for different ones, but it can't be turned back into an address. This lets the tester see that a position changes between home wifi and mobile data without anyone seeing the address.

It never returns, logs or stores an address, other headers, or the request body. Its own logs hold the status code only. To everyone else (no token, wrong token, expired, disabled) it answers a bare **404** with no body, exactly like a missing function.

## How it authenticates

* A random token of at least 32 bytes, from the founder's password manager. It is set as a function secret for the test window only, and never written anywhere else.
* The token is sent as `Authorization: Bearer <token>` and compared in constant time.
* Supabase's own key check (JWT verification) also stays **on**, so a request needs the project's public key as well. That isn't a secret, but it filters out casual traffic.
* There is no rate limit inside the diagnostic, because it touches no database and the token check is cheap. The expiry bounds the window.

## Off by default, and expiring on its own

It answers 404 unless **all three** of these hold:
1. `DIAG_ENABLED` is exactly `true`;
2. the token secret is set;
3. `DIAG_EXPIRES_AT` is in the future **and less than 24 hours away**. A later expiry is treated as unset.

So a forgotten deployment stops answering by itself within a day.

## Removal (the same session as the test)

1. Delete the function: in the Supabase dashboard (Edge Functions), or with `supabase functions delete proxy-diagnostic`.
2. Delete its secrets: `DIAG_ENABLED`, `DIAG_EXPIRES_AT` and the token.
3. Confirm the address answers 404, and that the function list no longer shows it.
4. Close the A3 PR unmerged, and delete its branch.
5. Record the confirmed hop count, and the date, in `docs/WAITLIST.md`. Then set `WAITLIST_TRUSTED_PROXY_HOPS` on the waitlist function, after approval.

## Threats and controls

| Threat | Control | What's left |
|---|---|---|
| Someone without the token learns anything | 404 with no body whenever authentication, the switch or the expiry fails, the same as a missing function | Its existence can be guessed from timing; that reveals nothing useful |
| The token leaks | Short life (at most 24 hours), deleted with the function; the token can do nothing but read header shapes | Within the window, a holder could learn the header layout |
| Visitor addresses exposed | Only shapes and session-keyed fingerprints are returned; nothing logged or stored | None identified |
| Left running | The expiry, the switch, and the removal checklist | Until deletion it remains a deployed function (inert after expiry) |
| Code drift into the real function | Separate function and branch, never merged; the guard test on `main` | None identified |
| The diagnostic is wrong, and its answer is trusted | The tester sends a known forged value and checks where it lands, from two networks, IPv4 and, if possible, IPv6 | See "What it can't prove" |

## What it can prove

* How many entries Supabase's own proxies add on staging today, from the networks tested.
* That a value a visitor forges on the left never reaches the trusted position.
* Whether IPv6 visitors arrive intact (only if tested from an IPv6 network).

## What it can't prove

* That Supabase won't change its proxies later. The waitlist function's health check can't detect that.
* That Production, which may be in another region, behaves the same. **Repeat the test on Production before activation there.**
* That `join-waitlist` receives the very same header. It's very likely, on the same platform and gateway, but it is an assumption.
* Anything about Turnstile, the database or TLS.

**Mitigation:** the waitlist function already fails safe. If the hop count ever pointed at one of Supabase's own proxies, the address in that position would be private or internal, and every request would fall into one shared bucket: a nuisance, never a bypass. Turnstile and the per email and overall limits still apply. Repeat this test after any Supabase notice about its network or gateway.
