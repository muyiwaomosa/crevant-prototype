/**
 * The My Split navigation icon: a single-colour simplification of the official
 * Splitpost symbol (src/logo/splitpost-logo.svg), on the same 24 px grid and
 * stroke as the lucide icons beside it (SP-DESIGN-002, refinement 1). Takes the
 * same props the navigation passes to lucide icons. Not for use below 20 px.
 */
export function MySplitIcon({ className, strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth={strokeWidth} />
      <path
        fill="currentColor"
        d="M6.5 12.5V8.6A1.6 1.6 0 0 1 8.1 7H15.9A1.6 1.6 0 0 1 17.5 8.6V9.75ZM6.5 15L17.5 12.25V15.4A1.6 1.6 0 0 1 15.9 17H8.1A1.6 1.6 0 0 1 6.5 15.4Z"
      />
    </svg>
  )
}
