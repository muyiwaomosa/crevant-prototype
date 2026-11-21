# Privacy notice addition for photo posts (DRAFT)

**Status: draft documentation only. Not published, not wired into the site.**
The live notice (`src/public/privacy/notice.ts`, shown at `/privacy`) is
public website content with its own version and approval; this text goes in
through its own reviewed pull request, with a new notice version, together
with the feedback wording (`docs/PRIVACY-NOTICE-PILOT-FEEDBACK-DRAFT.md`),
**before external pilot invitations**.

---

## Proposed notice text (as approved in review)

### Photos you post

If you post a photo, we store it and a smaller copy for the feed, with any
location and camera details removed. Photos are deleted when you delete the
post or your account.

---

## Notes for review (not part of the approved wording)

What the code does that the founder may want reflected before publishing:

* A photo in a post someone has **reported** is kept while that report is
  kept (open, then until 90 days after it is resolved, or longer under a
  legal or safety hold), even if the post or account is deleted.
* A photo in a post a moderator **hid** is kept while it can be restored,
  and deleted at pilot close.
* Deletion is done by the server, usually within seconds and at most about
  15 minutes (longer only while Storage is failing and retries run). The
  post disappears at once.
* Links already on someone's screen last up to an hour but stop when the
  file is deleted. For hidden or reported photos (kept), they can keep
  working for up to an hour, and browsers may cache a shown photo for up to
  an hour.
* Photos are visible only to signed-in pilot members who can see the post.
* New photo posts don't ask for a photo description. Older ones may have one stored with the post, used only as the photo's alternative text for screen readers.
