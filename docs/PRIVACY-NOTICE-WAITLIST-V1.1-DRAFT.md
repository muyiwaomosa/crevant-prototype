> **Draft for counsel. Not published.** The live waitlist notice is version 1.0
> (`src/public/privacy/NoticeBody.tsx`). This draft is version 1.1, covering
> the BL-009 data flow (founder decision D1, option A, Nov 28, 2026). It is
> published only after counsel's review and the founder's approval, through a
> reviewed pull request with a new notice version (`approved-notice.json`,
> `VITE_PRIVACY_NOTICE_VERSION` and the admin set-notice-version step), and
> before any verification email or invitation is sent.

# Waitlist privacy notice: changes for version 1.1

Only the sections below change. Everything else in version 1.0 stays as it is.

## What we collect (addition)

* **Whether you confirmed your email.** After you join, we email you a link.
  Opening it confirms that the address is yours. We keep when you confirmed it.
  We keep only a scrambled (hashed) copy of the link, never the link itself,
  and the link stops working after one use or 48 hours.

## How we use it (replaces "To invite people to the pilot")

* **To confirm your email.** We send one confirmation email when you join, and
  at most three in a day if you join again. Only confirmed addresses can be
  considered for the pilot.
* **To invite people to the pilot.** When we choose the next small group, we
  copy the details of confirmed people who agreed to this notice into the
  Splitpost pilot system, where our team reviews them. We copy only what the
  review and an invitation need: your email address, when you joined and
  confirmed, the version of this notice you agreed to, and your optional
  answers about how you'd use Splitpost (your groups, intent, platform,
  audience size, whether a creator introduced you, where you came from, and
  any creator's invitation link). We don't copy your interests list.
* The copy is deleted as soon as we invite you or decide not to, and in any
  case after 30 days. If you're invited, we email you a personal link that
  works once and lasts 14 days. Before we send it, we check again that you're
  still confirmed, still agreed and haven't left the waitlist.
* We record on the waitlist whether you were invited or not chosen. Joining
  still doesn't guarantee an invitation.

## Who else handles it (additions)

* **Resend** sends the confirmation and invitation emails for us. It receives
  your email address and the message.
* **The Splitpost pilot system** is hosted by Supabase in **Canada (Central)**.
  While we review you, your copied details are held there, so they move from
  the United States, where the waitlist is stored, to Canada.

> **Review note (question 50):** confirm the cross-border wording, and whether
> moving details from the United States waitlist to the Canadian pilot system
> needs anything beyond this notice.

## How long we keep it (additions)

* Confirmation links: until used, replaced or 48 hours, whichever is first.
* Review copies in the pilot system: until you're invited or not chosen, and
  never more than 30 days.
* If you leave the waitlist after your details were copied, we keep a record
  that holds no email address, only an internal number and a time, for up to
  13 months. It makes sure the pilot system deletes its copy and any unused
  invitation too.

## Leaving the waitlist and your other rights (addition)

* When you ask us to delete your waitlist entry, we delete it from the
  waitlist and from the pilot system: any review copy, and any invitation you
  haven't used. An invitation you used belongs to your pilot account, which you
  can delete at any time. If you delete that account, we delete your waitlist
  entry too.
