# Privacy notice additions for creator acquisition (DRAFT)

**Status: draft for founder and legal review. Not approved, not published,
not wired into the site.** The waitlist form cannot turn on until an approved
notice exists (`src/public/privacy/notice.ts`), and this text changes
nothing until it is reviewed, approved and added in its own pull request
with a new notice version.

The wording below describes exactly what the code in PR 32 stores. If the
reviewed wording changes what we're allowed to collect, the code changes to
match, never the other way round.

Placeholders for counsel are marked **[legal]**.

---

## 1. Proposed notice text

These sections are meant to slot into the waitlist privacy notice next to the
existing "What we collect when you join the waitlist" section.

### How you plan to use Splitpost (optional)

When you join the waitlist you can tell us whether you plan to create
content, discover and support creators, or both. We use this only to plan
who to invite to the pilot and what to build. It doesn't decide what you can
do on Splitpost, and you can skip it.

### If a creator introduced you (optional)

We may ask whether a creator introduced you to Splitpost. If you answer yes,
you can also type that creator's name or handle.

- This is only what you tell us. We don't check it, contact the creator,
  match it to anyone's account, or share it with them.
- It doesn't make you follow anyone, and it earns nothing for you or the
  creator.
- We use it, together with everyone else's answers, to understand how
  people hear about Splitpost.
- Please only type a public name or handle. We refuse links, email
  addresses and phone numbers.

**[legal]** This is a third party's name, given by you. Confirm the legal
basis (for example, legitimate interests in understanding how people find
the pilot) and whether the creator needs to be told.

### If you used a creator's invitation link

Creators accepted into the pilot can share a personal invitation link. If you
join through one:

- **When you open the link,** we show the name the creator agreed to display
  (or a general message if they haven't), and we count one anonymous visit for
  that link. We store no address, cookie or device detail with the count. To
  avoid counting the same person twice in a day, we keep a scrambled code
  made from your network address for up to two days, the same way we already
  limit repeated sign-ups. We can't turn it back into your address.
- **When you join,** we record which link you used with your waitlist entry.
- **If you're invited and create an account,** that record carries over to
  your account, and we'll ask whether you'd like to follow the creator. You
  choose Follow or Not now; we never follow anyone for you. We record your
  answer, and counts of answers, so we can see how well invitations work.
- The creator doesn't receive your email address or any other detail about
  you from this. Recording the link earns nothing for you or the creator.
  A follow you choose yourself works like any other follow.

### Measurement

We count steps such as link visits, sign-ups, accounts created and follow
decisions. These counts don't contain your email address, name, account,
network address or anything you typed. Our team sees totals, not individuals.

### How long we keep it

Your answers above, and which link you used, are part of your waitlist entry.
They're kept and deleted with it (proposed: 12 months after you joined or
last confirmed your place, **[legal]**), and deleting your entry deletes
them. Anonymous counts don't identify you and may be kept for the length of
the pilot **[legal: confirm]**. The scrambled codes used to avoid double
counting are deleted within two days.

### Your choices

Every question in this section is optional. Leaving them blank doesn't affect
your place on the waitlist. You can ask us to delete your waitlist entry at
any time, which deletes these answers too. **[legal: contact route and rights
wording to match the main notice]**

---

## 2. For creators accepted into the pilot (separate notice or agreement)

This belongs in the pilot creator agreement or a short creator notice,
**not** the waitlist notice. **[legal]**

- We record that you're a pilot creator, your status (accepted, paused or
  removed) and up to three content categories.
- We show a **public name on your invitation links only if you agree.** We
  record when you agreed, and you can withdraw that agreement at any time.
  Your name then stops showing straight away.
- Links are issued by Splitpost, not by you. They last 90 days unless we
  agree otherwise (never more than a year), and can be revoked at any time.
- You can see totals for your links: visits, sign-ups, accounts created and
  follow decisions. You never see who visited, joined or followed.
- Invitations earn you no money, Connection Points or other reward.

---

## 3. What the code stores, for the reviewer

| Data | Where | Personal? | Kept |
| --- | --- | --- | --- |
| Intent (create, discover, both) | `ops.waitlist.intent` | Yes, part of the entry | With the entry |
| "A creator introduced me" (yes / no) | `ops.waitlist.introduced_by_creator` | Yes | With the entry |
| Typed creator name or handle (1 to 60 characters, no links, emails or phone numbers) | `ops.waitlist.introducer_reported` | Yes, and a **third party's name** | With the entry |
| Which verified link they joined through | `ops.waitlist.creator_link_id`, then `ops.invitations`, then `ops.creator_link_redemptions` | Yes | With the entry or account |
| Follow decision (pending, followed, declined) | `ops.creator_link_redemptions` | Yes, account linked | With the account **[legal: confirm]** |
| Link visit, sign-up, account, follow counts | `ops.acquisition_events` | No: event, time, channel label, link only | For the pilot **[legal: confirm]** |
| Visit de-duplication and preview rate limits | `ops.invite_preview_limits` | Salted hashes of the network address | Two days |
| Creator's agreed public name and when they agreed | `ops.pilot_creators` | Yes, the creator's | While they're a pilot creator, or until withdrawn |

Nothing above is shown on the public site except a creator's **agreed**
public name, to someone holding one of that creator's valid links.

## 4. Before approval

1. Legal review of sections 1 and 2, including the **[legal]** points.
2. Decide whether the typed creator name is worth collecting at all. The
   form works without it, and removing the field is a small change.
3. Choose the new notice version string and effective date.
4. Add the approved text in its own reviewed pull request
   (`src/public/privacy/notice.ts` and `approved-notice.json`), then set the
   same version in the database and the build. No step here does that.
