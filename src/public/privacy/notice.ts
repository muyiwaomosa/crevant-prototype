import type { ComponentType } from 'react'
import approved from './approved-notice.json'
import { NoticeBody } from './NoticeBody'

/** The approved privacy notice: its version, effective date and text. */
export type ApprovedNotice = { version: string; effectiveDate: string; Body: ComponentType }

// Version 1.0, approved by the founder (docs/PRIVACY-NOTICE-DRAFT.md). Its
// version and effective date are in approved-notice.json.
const Body = NoticeBody as ComponentType | null

const version = (approved as { version: unknown }).version
const effectiveDate = (approved as { effectiveDate: unknown }).effectiveDate

/** The approved notice, or null while none is approved. */
export const APPROVED_NOTICE: ApprovedNotice | null =
  typeof version === 'string' && typeof effectiveDate === 'string' && Body ? { version, effectiveDate, Body } : null
