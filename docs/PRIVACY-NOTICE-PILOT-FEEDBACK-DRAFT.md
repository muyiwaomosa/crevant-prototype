# Privacy notice addition for pilot feedback (DRAFT)

**Status: wording approved by the founder for Build 5.2c; not yet published
or wired into the site.** The live notice (`src/public/privacy/notice.ts`,
shown at `/privacy`) is public website content with its own version and
approval. This text goes in through its own reviewed pull request, with a
new notice version, **before external pilot invitations**.

It describes exactly what migration `20261126000000_feedback` stores
(`docs/FEEDBACK.md`). It must not be widened to collect anything else.

---

## Proposed notice text

### Feedback you send

If you send feedback, we collect your message, name, pilot role, and the
part of Splitpost you were using. We use this information to understand
problems, evaluate suggestions, and improve Splitpost. Feedback messages are
retained through the pilot evaluation and deleted within 30 days after the
evaluation closes. Limited operational audit records may be retained
separately.

---

## Notes for review

* "Name" means the display name and username the member chose; email
  addresses are not shown with feedback.
* "The part of Splitpost you were using" is one name from a fixed list
  (Home, Discover, Profile, Clique, a post, Create post, Catch up, another
  page). No addresses, post contents, other members, device details or
  location are collected.
* "Limited operational audit records": ids, status changes, times and purge
  counts, without message or note text.
* Deleting an account deletes that member's feedback at once.
