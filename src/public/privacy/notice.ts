import type { ComponentType } from 'react'
import approved from './approved-notice.json'

/** The approved privacy notice: its version, effective date and text. */
export type ApprovedNotice = { version: string; effectiveDate: string; Body: ComponentType }

// The reviewed pull request that adds the approved notice sets the version and
// effective date in approved-notice.json and replaces `null` here with the
// component holding the approved text. Until then there is no notice.
const Body = null as ComponentType | null

const version = (approved as { version: unknown }).version
const effectiveDate = (approved as { effectiveDate: unknown }).effectiveDate

/** The approved notice, or null while none is approved. */
export const APPROVED_NOTICE: ApprovedNotice | null =
  typeof version === 'string' && typeof effectiveDate === 'string' && Body ? { version, effectiveDate, Body } : null
