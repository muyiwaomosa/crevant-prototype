# Splitpost waitlist privacy notice (DRAFT)

**Status: draft for founder and legal review. Not approved, not published,
not wired into the site.** The waitlist form cannot appear until an approved
notice exists in `src/public/privacy/notice.ts` with a matching version
(`src/public/waitlist/config.ts`). Publishing it is a separate reviewed pull
request that sets the version and effective date.

The text describes exactly what the waitlist code stores today
(`docs/WAITLIST.md`, "What is stored, and what isn't"). If the reviewed
wording narrows what we may collect, the code changes to match before launch.

The creator acquisition sections (`docs/PRIVACY-NOTICE-ACQUISITION-DRAFT.md`)
slot in where marked. Invited pilot members' accounts and the social features
(posts, follows, the Clique, likes, comments, Connection Points) are **not**
covered here: they need their own section before anyone is onboarded.

Placeholders are marked **[decide]** (a founder decision) or **[legal]** (for
counsel).

---

## Decisions needed before this can be approved

| # | Decision | Our proposal or current state |
| --- | --- | --- |
| 1 | **Legal operator** named in the notice | 1000859123 Ontario Inc. operating as Splitpost **[legal: confirm the name and that the business name is registered]** |
| 2 | **Privacy contact** (an address people can write to) | A dedicated mailbox such as privacy@ on the Splitpost domain **[decide: needs a domain and mailbox]** |
| 3 | **Who the notice is written for** (which privacy laws) | Canada (PIPEDA, plus Quebec Law 25 if Quebec residents may join). **[legal]** Decide whether to accept visitors from the EU, UK or California at launch; if yes, the notice needs their rights and legal bases. |
| 4 | **Retention period** | 12 months after the last verified confirmation, or after signup if never verified, removed by the monthly purge **[decide]** |
| 5 | **Where data is stored** | The Production database region **[decide: see the Production Supabase checklist; staging is us-west-2, Oregon, USA]** |
| 6 | **Service providers** to name | Supabase (database and server function), Vercel (hosting), Cloudflare Turnstile (bot check), Google Fonts (typefaces loaded by the page) **[decide: keep Google Fonts, or self-host the fonts so visitors' browsers never contact Google]** |
| 7 | **Email** | Verification and invitation emails are not built yet. **[decide]** The sender, and whether the notice mentions them now or in a later version |
| 8 | **Notice version string** | For example `notice-2026-11` **[decide]** |
| 9 | **Effective date** | The day it is published **[decide]** |
| 10 | **Age** | Adults 18 and older only, by self-confirmation (no date of birth) **[legal: confirm this is enough]** |
| 11 | **Creator acquisition sections** | Include now, or only when creator links are approved **[decide]** |

---

## Proposed notice text

### Splitpost privacy notice

**Version [decide]. Effective [decide].**

Splitpost is run by **[legal: operator name]** ("we"). This notice explains
what we collect when you join the Splitpost waitlist, why, how long we keep
it, and the choices you have. It covers the public website and the waitlist
only.

### What we collect when you join the waitlist

**Always:**
* **Your email address.** So we can contact you about the pilot.
* **That you confirmed you are 18 or older.** Yes or no. We don't ask for
  your date of birth.
* **Your consent to join the waitlist,** the version of this notice you saw,
  and when you agreed. This is our record that you agreed.
* **When you joined.**

**Only if you choose to tell us:**
* What interests you most about Splitpost (any of six fixed choices).
* Whether you share content online now.
* If you do: your main platform (from a fixed list) and roughly how many
  people follow you (one of four ranges, such as "1,000 to 10,000").

**From the link you used, if it had one:** a short label for where you found
us (for example, an Instagram bio link). It is set by us, not by you.

**[Insert the creator acquisition sections here, if approved.]**

**What we don't collect:** your name, your social media handles, your
address, your phone number, your IP address, free text, or any payment
information. We don't ask you to name anyone else.

### How we use it

* To invite people to the pilot in small groups. Your optional answers help
  us invite a balanced mix of people. **Joining doesn't guarantee an
  invitation.**
* To understand, in totals, who is interested and how they found us.
* To keep the waitlist working and safe (see "Keeping the form safe").

We don't sell your information, use it for advertising, or send you
marketing. If you're invited, the invitation email explains the pilot and its
own terms.

### Keeping the form safe

* **Bot check.** The form uses Cloudflare Turnstile to tell people from
  automated programs. Cloudflare processes information from your browser to
  do this, under its own privacy policy.
* **Rate limits.** To slow down abuse, we keep short-lived counters made from
  a one-way, salted code derived from your network address. We can't turn it
  back into your address, and the counters are deleted after two days.

### Who else handles it

We use these providers to run the waitlist. They process information only to
provide their service to us:

* **Supabase**: stores the waitlist and runs the form's server function, in
  **[decide: region and country]**.
* **Vercel**: hosts the website.
* **Cloudflare**: the Turnstile bot check.
* **Google Fonts**: serves the typefaces the website uses, which means your
  browser contacts Google when it loads a page. **[decide: remove if the
  fonts are self-hosted]**

Some of these providers may process information outside your country,
including in the United States. **[legal: cross-border transfer wording]**

### How long we keep it

We keep your waitlist entry for **[decide: 12 months]** after you joined or
last confirmed your place, then delete it. If you're invited and join the
pilot, your pilot account is covered by the pilot's own notice. Joining again
with the same email doesn't extend how long we keep your entry.

### Your choices and rights

* **Leave the waitlist** at any time: email **[decide: privacy contact]** and
  we'll delete your entry.
* **See or correct** what we hold about you: email the same address.
* **Withdraw consent** by asking us to delete your entry. We'll then stop
  using it.
* **Complain:** **[legal: the Office of the Privacy Commissioner of Canada,
  and any other authority that applies]**.

We'll reply within **[legal: 30 days]**. We may need to confirm that the email
address is yours before we act on a request.

### Children

Splitpost is for adults 18 and older. If we learn that someone under 18 has
joined, we delete their entry.

### Changes to this notice

If we change this notice, we'll publish the new version here with a new
version number and date. If a change affects information you've already
given us, we'll ask for your consent again before relying on it.

### Contact

**[legal: operator name and address]**, **[decide: privacy contact]**.

---

## Checks before approval

- [ ] Every statement matches the code on `main` (fields, the two-day rate
      limit counters, no IP addresses, the retention purge).
- [ ] The decisions table is complete, and every **[decide]** and **[legal]**
      placeholder is resolved.
- [ ] Counsel has reviewed the text.
- [ ] The publishing PR sets the version and effective date in
      `src/public/privacy/approved-notice.json`, and the notice body in
      `src/public/privacy/notice.ts`. The waitlist form stays off until the
      Vercel and database switches are set separately.
