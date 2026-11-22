import type { ComponentType } from 'react'

/**
 * The open beta's own documents: a privacy notice for beta accounts (the
 * published notice, src/public/privacy, covers the website and the waitlist
 * only) and the community rules. Each stays null until the founder approves
 * its text in a reviewed pull request (drafts: docs/OPEN-BETA-PRIVACY-NOTICE-DRAFT.md
 * and docs/COMMUNITY-RULES-DRAFT.md). Until BOTH are approved the sign-up page
 * stays closed, whatever the database or Supabase Auth settings say.
 */
export type BetaDocument = { version: string; effectiveDate: string; Body: ComponentType }

export const BETA_PRIVACY_NOTICE: BetaDocument | null = null
export const COMMUNITY_RULES: BetaDocument | null = null

export const BETA_DOCUMENTS_PUBLISHED = Boolean(BETA_PRIVACY_NOTICE && COMMUNITY_RULES)
