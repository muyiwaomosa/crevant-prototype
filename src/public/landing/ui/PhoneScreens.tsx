import clsx from 'clsx'
import type { ReactNode } from 'react'
import { HOMEPAGE_COPY } from '../copy'
import { SplitpostLogo } from '../../../logo/SplitpostLogo'

/**
 * The neutral phone frame the product illustrations are drawn in (see
 * ValueIllustrations.tsx). White, light greys and charcoal, so creators'
 * content stands out; the brand shows only in the logo and a single accent.
 * It carries "Concept · Sample data" inside the frame, so the label survives
 * cropping.
 */

const LABEL = HOMEPAGE_COPY.building.mockupLabel
const ink = 'text-[#1f2328]'

export function PhoneFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[260px] rounded-[40px] bg-[#1f2328] p-[7px] shadow-[0_40px_70px_-30px_rgb(0_0_0/0.55)] ring-1 ring-black/40">
      <div className={clsx('relative flex aspect-[9/18.5] flex-col overflow-hidden rounded-[33px] bg-[#f6f6f4]', ink)}>
        <div aria-hidden="true" className="flex items-center justify-between px-5 pb-1 pt-2.5 text-[10px] font-semibold">
          <span>9:41</span>
          <span className="h-[18px] w-[64px] rounded-full bg-[#1f2328]" />
          <span className="flex gap-0.5">
            <span className="h-2 w-2 rounded-full bg-[#1f2328]/70" />
            <span className="h-2 w-3.5 rounded-sm bg-[#1f2328]/70" />
          </span>
        </div>
        <div className="flex items-center gap-2 border-b border-black/8 bg-white px-3.5 py-2">
          <SplitpostLogo className="h-5 w-5" />
          <span className="truncate font-sp-display text-[13px] font-extrabold">{title}</span>
        </div>
        <div data-testid="mockup-label" className="bg-[#e8e6e1] px-3 py-1 text-center text-[9px] font-bold uppercase tracking-[0.14em] text-[#3a3f45]">
          {LABEL}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-3">{children}</div>
      </div>
    </div>
  )
}
