import { BUILD_WAITLIST_ENV, readWaitlistConfig } from './config'

/**
 * Whether visitors can actually register: true only when this build has an
 * approved privacy notice and every waitlist setting (see config.ts). The
 * same check decides whether /join shows the form, so the buttons can never
 * promise a signup the page can't take, and they switch back to "Join the
 * Waitlist" automatically once the form is configured.
 */
export const WAITLIST_OPEN: boolean = readWaitlistConfig(BUILD_WAITLIST_ENV) !== null

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

/** Where every call to action on the public site goes: the one Splitpost sign up, for everyone. */
export const JOIN_PATH = '/join'

/** The call to action once registration is authorized. */
export const REGISTRATION_CTA = 'Join Splitpost'

/**
 * True only when a build sets VITE_REGISTRATION_OPEN to exactly 'true', the
 * one switch from the pre-launch phase ("Join the Waitlist") to open
 * registration ("Join Splitpost"). Off by default, and set in no environment
 * today, so every build stays pre-launch. It changes wording only: it opens
 * nothing and changes no production gate.
 */
export function readRegistrationOpen(value: unknown): boolean {
  return typeof value === 'string' && value.trim() === 'true'
}

export const REGISTRATION_OPEN: boolean = readRegistrationOpen(import.meta.env.VITE_REGISTRATION_OPEN)

/**
 * The primary call to action for this build, used by every button on the
 * public site: "Join the Waitlist" during pre-launch, "Join Splitpost" once
 * registration is authorized. While /join can't take a signup at all, it says
 * "Waitlist Opens Soon" in either phase, so no button promises a signup the
 * page can't take.
 */
export function waitlistCta(open: boolean = WAITLIST_OPEN, registration: boolean = REGISTRATION_OPEN): string {
  if (!open) return WAITLIST_CLOSED_COPY.cta
  return registration ? REGISTRATION_CTA : 'Join the Waitlist'
}
