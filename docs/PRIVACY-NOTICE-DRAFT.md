# Splitpost privacy notice, version 1.0 (DRAFT FOR APPROVAL)

**Status (2026-11-17): final draft, ready for counsel. Not approved, not
published, not wired into the site.** Only the items under "What blocks
publication" remain. The waitlist form cannot appear
until an approved notice exists in `src/public/privacy/notice.ts` with a
matching version (`src/public/waitlist/config.ts`). Publishing is a separate
reviewed pull request.

Every statement below was checked against the code on `main` (the form in
`src/public/waitlist/WaitlistForm.tsx`, the server function in
`supabase/functions/join-waitlist/`, and `docs/WAITLIST.md`). If the
approved wording narrows what we may collect, the code changes first. This
draft does not establish legal compliance: items marked **[legal]** need
counsel, and items marked **[confirm]** need a fact checked before
publication.

It replaces the earlier draft and folds in the creator acquisition sections
from `docs/PRIVACY-NOTICE-ACQUISITION-DRAFT.md`, because the form on `main`
already asks those questions.

---

## What blocks publication

1. **The operator's exact registered name and mailing address** (founder).
2. **Counsel's review** (see "Open questions"), in particular: which laws
   apply, including for people outside Canada; the wording for storage in
   the United States; whether one consent checkbox is enough; the reply time,
   the complaint authority, and the retention periods (12 months, 90 days).
3. **A test message** to and from privacy@splitpost.ca.

Everything else in the text matches the code on `main` and the waitlist
journey test (PR #42): the fields, the optional questions, the creator link
attribution, the two-day codes, no stored IP addresses, the 12-month purge
and deletion on request by email.

## Working decisions (founder, updated 2026-11-17)

| Topic | Decision | Still needed before publication |
| --- | --- | --- |
| Website | https://splitpost.ca (canonical address www.splitpost.ca) | Live since 2026-11-17 with the waitlist closed. **[confirm]** the domain is registered to the operator. |
| Operator | 1000859123 Ontario Inc. | **[confirm]** the exact registered name, the registered business name "Splitpost" if used, and a mailing address. |
| Privacy contact | privacy@splitpost.ca (created 2026-11-17) | **[confirm]** a test message is received and answered. |
| Retention | 12 months for inactive waitlist records, removed by the monthly purge | Documented deletion policy: `docs/WAITLIST-OPERATIONS.md` (monthly purge, delete on request). **[legal]** confirm the period. |
| Audience | Potentially international. No Canada-only restriction is implemented (the form doesn't ask for a country). | **[legal]** what the notice must add for people outside Canada (see "Open questions", item 8). |
| Hosting | **United States:** the Production database is in Supabase's West US (Oregon) region, `us-west-2` (Canada (Central) wasn't offered). Vercel and Cloudflare may also process data outside Canada. | **[legal]** the cross-border wording and any assessment it needs ("Open questions", item 3). Other providers (Vercel, Cloudflare) may process data outside Canada. |
| Fonts | Self-hosted | ✅ Done (PR #38, `ec7df1c`): no Google Fonts requests and no Google hosts in the CSP, so Google isn't a service provider here. |
| Creator invitation links | Keep the section in 1.0 | None. |
| Creator link hourly visit counts | Kept 90 days | **[legal]** confirm the period. |
| Version | `1.0` | The effective date is set on publication. |

## Open questions and dependencies

**For counsel [legal]**
1. **Which laws apply.** Likely PIPEDA, the federal law for private sector
   organisations in Ontario; counsel to confirm. If Quebec residents can join, Quebec's privacy law
   (Law 25) may add obligations, for example a named person in charge of
   personal information, assessments before transferring data outside Quebec,
   and specific wording. Counsel should confirm what applies and what the
   notice must say.
2. **Accountable person.** Whether the notice must name a person (title and
   contact) responsible for privacy, and who that is.
3. **Cross-border processing.** Waitlist entries are **stored in the United
   States** (Supabase, Oregon), and Vercel and Cloudflare may process data
   outside Canada too. Counsel to confirm: the notice wording (that data is
   stored in the US and may be accessible to US authorities under US law);
   whether a written assessment of the transfer is needed (for example
   under Quebec's Law 25 if Quebec residents can join); and that our
   contracts with these providers (their data processing terms) are in
   place. Moving the database to Canada later would mean a new project and a
   data migration, so decide now whether US hosting is acceptable for
   launch.
4. **Consent.** Whether the single required checkbox ("I agree to join the
   waitlist and to this notice") is enough for the optional research answers
   and the creator link attribution, or whether they need separate consent.
5. **The temporary codes made from network addresses.** Confirm they are
   described correctly, and whether any cookie or similar notice is needed
   (nothing is stored on the visitor's device).
6. **Age.** Whether self-confirming 18 or older is enough.
7. **Response time** for access and deletion requests, and which authority
   people can complain to.
8. **People outside Canada.** Sign-ups aren't limited to Canada. If people in
   the EU, the UK, US states with privacy laws (for example California) or
   elsewhere can join, counsel should say what the notice must add: for
   example a legal basis for each use, their specific rights, how to contact
   us from those regions, and whether any local representative is needed.
   Or whether to limit sign-ups after all.

**For the founder [decide]**
1. **The operator's exact registered name and mailing address** as printed
   on the notice.
2. **Email.** Verification and invitation emails aren't built yet. This
   notice says we will email invitations; the sender address should be on
   splitpost.ca.

**Operational dependencies**
1. ✅ The splitpost.ca domain (live) and the privacy@splitpost.ca mailbox
   (created; send and receive test pending).
2. ~~Self-hosted fonts~~ ✅ done (PR #38).
3. ✅ The Production Supabase project exists (`hmrliwoychnqrbbydorg`,
   us-west-2); setup and migrations follow
   `docs/PRODUCTION-SUPABASE-CHECKLIST.md`. Accept Supabase's, Vercel's and
   Cloudflare's data processing terms for the organization and projects.
4. A way to verify identity before acting on a request (for example, replying
   from the address on the list) and a written procedure in
   `docs/WAITLIST-OPERATIONS.md`.

---

## Proposed notice text (version 1.0)

> # Privacy notice
>
> **Version 1.0. Effective [set on publication].**
>
> Splitpost is operated by **1000859123 Ontario Inc.** ("we", "us")
> **[confirm the registered name and address]**. This notice explains what we
> collect when you visit our website and join the Splitpost waitlist, why we
> collect it, how long we keep it, and the choices you have.
>
> It covers our website at **splitpost.ca** (www.splitpost.ca) and the waitlist only. If you're invited to
> the Splitpost pilot, we'll tell you how your pilot account works before you
> create it.
>
> ## What we collect when you join the waitlist
>
> **Always:**
> - **Your email address,** so we can contact you about the pilot.
> - **That you confirmed you're 18 or older.** We don't ask for your date of
>   birth.
> - **Your agreement to join the waitlist,** the version of this notice you
>   saw, and when you agreed. This is our record of your consent.
> - **When you joined.**
>
> **Only if you choose to answer:**
> - Whether you plan to create content, discover and support creators, or
>   both.
> - What interests you most about Splitpost (from six fixed choices).
> - Whether you share content online now, and if you do, your main platform
>   (from a fixed list) and roughly how many people follow you (one of four
>   ranges).
> - Whether a creator introduced you to Splitpost: yes or no. We don't ask
>   who.
>
> **From the link you used, if it had one:**
> - A short label we chose for where you found us (for example, a link in an
>   Instagram bio).
> - If it was a creator's personal invitation link, which link it was.
>
> **We don't collect** your name, social media handles, address, phone
> number, payment details or free text, and we don't ask you to name anyone
> else. We don't store your IP address.
>
> Your answers to the optional questions never decide what you can do on
> Splitpost, and leaving them blank doesn't affect your place on the
> waitlist.
>
> ## If you used a creator's invitation link
>
> Creators accepted into the pilot can share a personal invitation link. If
> you open one:
>
> - **We show who invited you:** the name the creator agreed we could show,
>   or a general message.
> - **We count the visit.** So the same visitor isn't counted again and
>   again, we make a temporary code from your network address using a secret
>   key. We never store the address itself. Someone holding our secret key
>   could check whether a particular address made a visit, so we treat the
>   code as personal information. We delete it within two days, and it's
>   never connected to your waitlist entry.
> - **If you then join the waitlist,** we record which link you used. If
>   you're invited and create an account, that record carries over to it.
>
> The creator never receives your email address or anything else about you.
> They can see totals for their link, never individuals. Using a link earns
> nothing for you or the creator, and we never follow anyone on your behalf.
>
> ## How we use it
>
> - **To invite people to the pilot,** in small groups. Your optional answers
>   help us invite a balanced mix of people. Joining doesn't guarantee an
>   invitation.
> - **To understand, in totals,** who is interested and how people hear about
>   us. We count steps such as link visits and sign-ups by the hour, the link
>   and the label. These counts don't include your email address, your
>   network address or the temporary code, but because small counts could be
>   matched to a person, we protect them like the waitlist itself.
> - **To keep the waitlist working and safe** (see below).
>
> We don't sell your information, use it for advertising, or send you
> marketing.
>
> ## Keeping the form safe
>
> - **Bot check.** The form uses Cloudflare Turnstile to tell people from
>   automated programs. Cloudflare processes information from your browser to
>   do this, under its own privacy policy.
> - **Rate limits.** To slow down abuse, we keep short-lived counters made
>   from one-way, keyed codes derived from your email address and your
>   network address. They can't be turned back into either, and we delete
>   them after two days.
>
> ## Who else handles your information
>
> We use these service providers to run the website and the waitlist. They
> process information only to provide their service to us:
>
> - **Supabase:** stores the waitlist and runs the form's server function, in
>   the **United States** (West US, Oregon).
> - **Vercel:** hosts the website.
> - **Cloudflare:** the Turnstile bot check.
>
> Your waitlist entry is stored in the United States. These providers may
> also process information in other countries. Information stored or
> processed outside Canada is subject to the laws of those countries and may
> be accessible to their courts, law enforcement and national security
> authorities. **[legal: confirm this wording]**
>
> ## How long we keep it
>
> - **Your waitlist entry,** including your answers and which link you used:
>   until **12 months** after you joined or last confirmed your place, then we
>   delete it. Joining again with the same email address doesn't extend this.
> - **The hourly counts:** 90 days. **[legal: confirm]**
> - **The temporary codes and rate limit counters:** two days.
>
> If you're invited and join the pilot, your pilot account is covered by the
> pilot's own notice.
>
> ## Your choices and rights
>
> - **Leave the waitlist at any time.** Email **privacy@splitpost.ca** from
>   the address you joined with, and we'll delete your entry and your
>   answers. (The waitlist's confirmation screen says the same.)
> - **See or correct** the information we hold about you, by emailing the
>   same address.
> - **Withdraw your consent** by asking us to delete your entry.
>
> We may need to confirm that the email address is yours before we act on a
> request. We'll reply within **[legal: 30 days]**. If you're not satisfied
> with our answer, you can contact **[legal: the Office of the Privacy
> Commissioner of Canada, and any other authority that applies]**.
>
> ## Who can join
>
> Splitpost is for adults 18 and older. If we learn that someone under 18 has
> joined, we delete their entry.
>
> **[legal: if people outside Canada can join, a section here on their
> rights and how to exercise them]**
>
> ## Changes to this notice
>
> If we change this notice, we'll publish the new version here with a new
> version number and date. If a change affects how we use information you've
> already given us, we'll ask for your agreement again first.
>
> ## Contact
>
> **1000859123 Ontario Inc.** **[confirm address]**
> privacy@splitpost.ca

---

## Checklist before the publishing PR

- [ ] Every **[confirm]**, **[decide]** and **[legal]** item above is
      resolved, and the open questions are answered.
- [ ] Counsel has reviewed the final text.
- [x] Fonts are self-hosted, and Google is removed from the CSP (PR #38).
- [ ] The text still matches the code on `main` (fields, two-day codes, no IP
      addresses stored, the purge).
- [ ] The publishing PR sets `version: "1.0"` and the effective date in
      `src/public/privacy/approved-notice.json`, and the notice body in
      `src/public/privacy/notice.ts`. The form stays off until its Vercel and
      database switches are set, separately approved.
