# Privacy notice additions for creator acquisition (DRAFT)

**Status: draft for founder and legal review. Not approved, not published,
not wired into the site.** The waitlist form cannot turn on until an approved
notice exists (`src/public/privacy/notice.ts`). This text changes nothing
until it is reviewed, approved and added in its own pull request with a new
notice version.

The wording describes exactly what the code in PR 32 stores. If the reviewed
wording changes what we may collect, the code changes to match.

Placeholders for counsel are marked **[legal]**.

**Changed in this revision:**
- The form no longer asks for a creator's name or handle. Nothing in the
  notice needs to cover a third party's name.
- The wording no longer calls the measurement "anonymous". It describes the
  temporary identifier made from a network address for what it is.

---

## 1. Proposed notice text

These sections slot into the waitlist privacy notice next to "What we collect
when you join the waitlist".

### How you plan to use Splitpost (optional)

When you join the waitlist you can tell us whether you plan to create
content, discover and support creators, or both. We use this only to plan who
to invite to the pilot and what to build. It doesn't decide what you can do
on Splitpost, and you can skip it.

### Whether a creator introduced you (optional)

We may ask whether a creator introduced you to Splitpost: yes or no. We don't
ask who. Your answer doesn't link you to anyone, doesn't make you follow
anyone, and earns nothing for you or anyone else. We use it, together with
everyone else's answers, to understand how people hear about us.

### Where you came from (optional, from the link)

If the link you used to reach us includes a channel label (for example, one
we put in an Instagram bio), we record that label with your entry. It's a
label we chose, not anything about you.

### If you used a creator's invitation link

Creators accepted into the pilot can share a personal invitation link. If you
open one:

- **We show who invited you.** That's the creator's name, if they agreed to
  it, or a general message if they haven't.
- **We count the visit for that link.** To avoid counting the same visitor
  over and over, we make a temporary code from your network address (your
  IP address, or the first part of it for IPv6). We make it with a secret
  key, and we never store the address itself.
  - That code is still linked to your network address: someone holding our
    secret key could check whether a particular address made a visit. So we
    treat it as personal data.
  - We keep it for at most two days, only to prevent double counting and to
    limit abuse. Then it's deleted. It's never stored in our visit counts or
    connected to your waitlist entry.
- **The visit count itself** records only that a visit happened, the hour,
  and which link. It doesn't record who you are.

If you then join the waitlist, we record which link you used with your entry.

If you're invited and create an account:
- That record carries over to your account.
- We ask whether you'd like to follow the creator who invited you. You
  choose Follow or Not now, and we never follow anyone for you.
- We record your answer, so we can see how well invitations work.

The creator doesn't receive your email address or any other detail about
you. They can see totals for their link, never individuals. Using a link earns
nothing for you or the creator. A follow you choose yourself works like any
other follow.

### Measurement

We count steps such as link visits, sign-ups, accounts created and follow
decisions, by the hour, the channel label and the link.

These counts don't contain your email address, name, account, network address
or the temporary code. But with small numbers (one sign-up through one link in
one hour, say), a count could still be matched to you by someone with access
to our systems. So we protect the counts the same way as the waitlist itself.

The visit numbers are estimates:
- several people on one network can count as one visitor;
- one person moving between networks can count as several.

**[legal]** Confirm whether this needs a legal basis statement (for example,
legitimate interests in measuring the pilot) and whether the temporary code
needs separate mention in a cookie or similar notice. It isn't a cookie and
nothing is stored on your device.

### How long we keep it

- **Your answers above, and which link you used,** are part of your waitlist
  entry. They're deleted with it: proposed 12 months after you joined or last
  confirmed your place **[legal]**. Deleting your entry deletes them.
- **Your follow decision** stays with your account while you have one
  **[legal: confirm]**.
- **The hourly counts** are kept for the length of the pilot **[legal: confirm]**.
- **The temporary codes made from network addresses** are deleted within two
  days.

### Your choices

Every question in this section is optional. Leaving them blank doesn't affect
your place on the waitlist. You can ask us to delete your waitlist entry at
any time, which deletes these answers too. **[legal: contact route and rights
wording to match the main notice]**

---

## 2. For creators accepted into the pilot (separate notice or agreement)

This belongs in the pilot creator agreement or a short creator notice, not
the waitlist notice. **[legal]**

- We record that you're a pilot creator, your status (accepted, paused or
  removed) and up to three content categories.
- **Your public name shows on your invitation links only if you agree.** We
  record when you agreed, and you can withdraw that agreement at any time.
  Your name then stops showing straight away.
- Splitpost issues links, not you. They last 90 days unless we agree
  otherwise (never more than a year), and can be revoked at any time.
  Revoking is final.
- You can see totals for your links: estimated visits, sign-ups, accounts
  created and follow decisions. You never see who visited, joined or
  followed.
- Invitations earn you no money, Connection Points or other reward.

---

## 3. What the code stores, for the reviewer

| Data | Where | What kind | Kept |
| --- | --- | --- | --- |
| Intent (create, discover, both) | `ops.waitlist.intent` | Personal, part of the entry | With the entry |
| "A creator introduced me" (yes / no) | `ops.waitlist.introduced_by_creator` | Personal, names nobody | With the entry |
| Channel label from `?src=` | `ops.waitlist.source` (existing) | A label we chose | With the entry |
| Which verified link they joined through | `ops.waitlist.creator_link_id`, then `ops.invitations`, then `ops.creator_link_redemptions` | Personal | With the entry or account |
| Follow decision (pending, followed, declined) | `ops.creator_link_redemptions` | Personal, account linked | With the account **[legal]** |
| Step counts: visits, sign-ups, accounts, follow decisions | `ops.acquisition_events` | No identifier; hour, channel label, link only. Could be narrowed down when numbers are small | For the pilot **[legal]** |
| Preview rate limits and visit de-duplication | `ops.invite_preview_limits` | **Pseudonymous**: HMAC of the network address with a secret salt (and, for visits, a hash of that with the link) | Two days |
| Creator's agreed public name and when they agreed | `ops.pilot_creators` | Personal, the creator's | While they're a pilot creator, or until withdrawn |

Nothing above is shown on the public site except a creator's **agreed**
public name, to someone holding one of that creator's valid links.

**Not collected:** a typed creator name or handle, the visitor's network
address, cookies or device identifiers.

## 4. Before approval

1. Legal review of sections 1 and 2, including the **[legal]** points.
2. Choose the new notice version string and effective date.
3. Add the approved text in its own reviewed pull request
   (`src/public/privacy/notice.ts` and `approved-notice.json`). Then set the
   same version in the database and the build. No step here does that.
