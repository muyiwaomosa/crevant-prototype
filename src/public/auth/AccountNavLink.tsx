import { Link } from 'react-router-dom'
import { LogIn, UserRound } from 'lucide-react'
import { buttonClass } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'

/**
 * Header link for the full app: "Your account" when signed in, otherwise
 * "Sign In" to the real sign-in page. Text from 420px wide, an icon below,
 * with the same accessible name either way.
 */
export function AccountNavLink() {
  const signedIn = useAuth().status === 'signed-in'
  const [to, label, Icon] = signedIn ? (['/app', 'Your account', UserRound] as const) : (['/sign-in', 'Sign In', LogIn] as const)
  return (
    <Link to={to} aria-label={label} data-testid="header-sign-in" className={`${buttonClass('ghost', 'sm')} h-11 w-11 px-0 min-[420px]:h-9 min-[420px]:w-auto min-[420px]:px-3.5 whitespace-nowrap`}>
      <Icon className="h-5 w-5 min-[420px]:hidden" aria-hidden="true" />
      <span className="hidden min-[420px]:inline" aria-hidden="true">
        {label}
      </span>
    </Link>
  )
}
