# Splitpost privacy notice, version 1.0 (DRAFT FOR APPROVAL)

**Status (2026-11-17): draft for founder and counsel review. Not approved, not
published, not wired into the site.** The waitlist form cannot appear until an
approved notice exists in `src/public/privacy/notice.ts` with a matching
version (`src/public/waitlist/config.ts`). Publishing is a separate reviewed
pull request, after the founder approves the final text.

Every statement below was checked against the code on `main` (`7f27c56`): the
form in `src/public/waitlist/WaitlistForm.tsx`, the server function in
`supabase/functions/join-waitlist/`, the database rules in `docs/WAITLIST.md`
and the admin workflows. If the approved wording narrows what we may collect,
the code changes first. This draft does not establish legal compliance: items
marked **[legal]** need professional privacy review, **[confirm]** needs a
fact checked, and **[decide]** needs a founder decision.

---

## Company details (founder, 2026-11-17)

| Item | Value | Status |
| --- | --- | --- |
| Operator (legal name) | **1000859123 ONTARIO INC.** | Given by the founder. The notice names the corporation as the operator; Splitpost is its brand, not a separate company. |
| Operating brand | Splitpost | **[confirm]** whether "Splitpost" is registered as a business name of the corporation (see below). |
| Jurisdiction | Ontario, Canada | Given by the founder. |
| Mailing address | 1890 Marconi Boulevard, London, Ontario N5V 4T5, Canada | From existing records. **[confirm]** it is current and is where privacy mail should go (it will be printed on a public page). |
| Privacy contact | privacy@splitpost.ca | Used for every privacy question, access, correction and deletion request, and every public contact link. The site reads it from one constant (`src/public/privacy/contact.ts`). **[confirm]** a test message is received and answered. |
| Website | https://www.splitpost.ca | Live, waitlist closed. **[confirm]** the domain is registered to the corporation. |

**Business name registration [confirm].** Ontario's Business Names Act
generally requires a corporation that carries on business under a name other
than its corporate name to register that name. If "Splitpost" isn't
registered yet, register it with the Ontario Business Registry before launch,
or confirm with counsel that it isn't needed. A business name search on the
Ontario Business Registry shows whether it is. The notice text below works
either way, because it names the corporation as the operator.

## Unified experience (founder decision, 2026-11-17)

Splitpost has **one account and one experience for everyone**: no creator or
fan account types, journeys or modes. Everyone sees the same form with the
same optional questions. Internal analysis labels are worked out from the
optional answers, are never shown to anyone, and never decide permissions,
features, onboarding or who may join.

## What blocks publication

1. **[confirm]** the mailing address and the business name registration
   (above).
2. **[legal]** professional review of the open questions below.
3. **[confirm]** a test message to and from privacy@splitpost.ca.
4. **[decide]** the founder approves the final text and its effective date.

## Open questions

**For professional privacy review [legal]**
1. **Which laws apply.** Likely PIPEDA for a private sector organisation in
   Ontario. If Quebec residents can join, Quebec's Law 25 may add obligations
   (a named person in charge of personal information, an assessment before
   data leaves Quebec, specific wording).
2. **Accountable person.** Whether the notice must name a person or title
   responsible for privacy, and who that is (see founder decisions).
3. **United States hosting.** Entries are stored in the US (Supabase, Oregon),
   and Vercel and Cloudflare may process data outside Canada. Confirm the
   wording, whether a written transfer assessment is needed, and that the
   providers' data processing terms are accepted. Moving to Canada later means
   a new project and a data migration, so decide now whether US hosting is
   acceptable for launch.
4. **Consent.** The form has two required checkboxes: "I'm 18 or older." and
   "I agree that Splitpost can store these details and email me about the
   pilot, as described in the privacy notice." Confirm this is enough for the
   optional answers and the invitation link attribution, or whether they need
   separate consent. The consent line says "Splitpost", the brand; confirm
   that's acceptable with the corporation named in the notice.
5. **The temporary codes made from network addresses.** Confirm the
   description, and that no cookie notice is needed (nothing is stored on the
   visitor's device by us; Turnstile is Cloudflare's).
6. **Age.** Whether self-confirming 18 or older is enough.
7. **Reply time and complaints.** The proposed 30 days, and which authority
   people can complain to.
8. **People outside Canada.** Sign-ups aren't limited to Canada. Say what the
   notice must add for the EU, the UK, US states with privacy laws or
   elsewhere, or whether to limit sign-ups.
9. **Retention periods.** 12 months for waitlist entries, 90 days for the
   hourly counts, two days for codes and counters.

**For the founder [decide]**
1. **Who is accountable for privacy** (a name or a title, for example
   "Privacy Officer, 1000859123 ONTARIO INC."), reachable at
   privacy@splitpost.ca.
2. **Whether to accept sign-ups from outside Canada** for launch.
3. **Whether US hosting is acceptable for launch** (counsel's view first).
4. **How quickly deletion requests are done** in practice. Proposed: within
   30 days, normally much sooner, using the `delete` admin workflow.
5. **The effective date,** set on publication.

**Operational dependencies**
1. Accept Supabase's, Vercel's and Cloudflare's data processing terms for the
   organisation and projects.
2. A written identity check before acting on a request: reply to, and act
   only on requests from, the address on the list (`docs/WAITLIST-OPERATIONS.md`).
3. A monthly reminder to run the retention purge (there is no scheduled
   deletion).

---

## Proposed notice text (version 1.0)

> # Privacy notice
>
> **Version 1.0. Effective [set on publication].**
>
> Splitpost is a brand of **1000859123 ONTARIO INC.**, a corporation in
> Ontario, Canada ("we", "us"). We operate the Splitpost website and waitlist.
> This notice explains what we collect when you visit www.splitpost.ca and
> join the Splitpost waitlist, why we collect it, how long we keep it, and the
> choices you have.
>
> It covers our website and the waitlist only. If you're invited to the
> Splitpost pilot, we'll tell you how your pilot account works before you
> create it.
>
> ## One waitlist for everyone
>
> Everyone joins the same way and sees the same questions. There's no
> separate list or account type for creators or anyone else.
>
> ## What we collect when you join the waitlist
>
> **Always:**
> - **Your email address,** so we can contact you about the pilot.
> - **That you confirmed you're 18 or older.** We don't ask for your date of
>   birth.
> - **Your agreement,** the version of this notice you saw, and when you
>   agreed. This is our record of your consent.
> - **When you joined.**
>
> **Only if you choose to answer:**
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
> Your optional answers never decide what you can do on Splitpost, and
> leaving them blank doesn't affect your place on the waitlist. If you join
> again with the same email address, nothing changes; to change your answers,
> email us.
>
> ## If you used a creator's invitation link
>
> Creators in the pilot can share a personal invitation link. If you open one:
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
>   help us invite a balanced mix of people. When we invite a group, we note
>   why, from a short fixed list (for example, to balance the mix). Joining
>   doesn't guarantee an invitation.
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
> - **Your waitlist entry,** including your answers, your consent record and
>   which link you used: until **12 months** after you joined or last
>   confirmed your place, then we delete it. Joining again with the same email
>   address doesn't extend this.
> - **The hourly counts:** 90 days. **[legal: confirm]**
> - **The temporary codes and rate limit counters:** two days.
>
> If you're invited and join the pilot, your pilot account is covered by the
> pilot's own notice.
>
> ## Leaving the waitlist and your other rights
>
> **To leave the waitlist,** email
> **[privacy@splitpost.ca](mailto:privacy@splitpost.ca)** from the address you
> joined with. We'll delete your entry, your answers, your consent record and
> any invitation not yet accepted, then reply to confirm. If you didn't write
> from that address, we may ask you to confirm it's yours first. The
> short-lived rate limit counters can't be linked to you and are deleted
> within two days anyway.
>
> You can also email **privacy@splitpost.ca** to:
> - **see** the information we hold about you;
> - **correct** it;
> - **withdraw your consent,** which we do by deleting your entry;
> - **ask a question** about this notice or how we handle your information.
>
> We'll reply within **[legal: 30 days]**. If you're not satisfied with our
> answer, you can contact **[legal: the Office of the Privacy Commissioner of
> Canada, and any other authority that applies]**.
>
> **[legal: if people outside Canada can join, a section here on their rights
> and how to exercise them]**
>
> ## Who can join
>
> Splitpost is for adults 18 and older. If we learn that someone under 18 has
> joined, we delete their entry.
>
> ## Changes to this notice
>
> If we change this notice, we'll publish the new version here with a new
> version number and date. If a change affects how we use information you've
> already given us, we'll ask for your agreement again first.
>
> ## Contact
>
> **1000859123 ONTARIO INC.** (Splitpost)
> 1890 Marconi Boulevard, London, Ontario N5V 4T5, Canada **[confirm]**
> **[privacy@splitpost.ca](mailto:privacy@splitpost.ca)**
> **[decide: the person or title accountable for privacy]**

---

## Checklist before the publishing PR

- [ ] Every **[confirm]**, **[decide]** and **[legal]** item above is resolved.
- [ ] Professional privacy review of the final text.
- [ ] The founder approves the final text.
- [x] Fonts are self-hosted, and Google is removed from the CSP (PR #38).
- [x] privacy@splitpost.ca is the only contact address on the site
      (`src/public/privacy/contact.ts`), used by the form's leave link.
- [ ] The text still matches the code on `main` (fields, two-day codes, no IP
      addresses stored, the purge, the delete workflow).
- [ ] The publishing PR sets `version: "1.0"` and the effective date in
      `src/public/privacy/approved-notice.json`, and the notice body in
      `src/public/privacy/notice.ts`. The form stays off until its Vercel and
      database switches are set, separately approved.
