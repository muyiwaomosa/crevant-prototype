import { readWaitlistConfig } from './config'

/**
 * Whether visitors can actually register: true only when this build has an
 * approved privacy notice and every waitlist setting (see config.ts). The
 * same check decides whether /join shows the form, so the buttons can never
 * promise a signup the page can't take, and they switch back to "Join the
 * Waitlist" automatically once the form is configured.
 */
export const WAITLIST_OPEN: boolean = readWaitlistConfig(import.meta.env) !== null

/** The wording while registration is closed. Draft, pending founder approval. */
export const WAITLIST_CLOSED_COPY = {
  cta: 'Waitlist Opens Soon',
  // The header button on phones under 390px wide, where the full label doesn't fit.
  ctaShort: 'Opens Soon',
  close: 'The waitlist opens soon. Be part of a better split.',
  joinTitle: 'The Waitlist Opens Soon',
  notOpenTitle: "You can't sign up just yet.",
  notOpenBody:
    "We'll open the waitlist on this page as soon as our privacy notice is published, so you can see exactly how your information is handled before you share it.",
  collectsNothing: "Until then, this page doesn't collect anything.",
} as const

/** The waitlist button label for this build. */
export function waitlistCta(open: boolean = WAITLIST_OPEN): string {
  return open ? 'Join the Waitlist' : WAITLIST_CLOSED_COPY.cta
}
