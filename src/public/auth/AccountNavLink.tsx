import { Link } from 'react-router-dom'
import { buttonClass } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'

/** Header link for the full app: "Your account" when signed in, otherwise "Sign in". */
export function AccountNavLink() {
  const signedIn = useAuth().status === 'signed-in'
  return signedIn ? (
    <Link to="/app" className={buttonClass('ghost', 'sm')}>
      Your account
    </Link>
  ) : (
    <Link to="/sign-in" className={buttonClass('ghost', 'sm')}>
      Sign in
    </Link>
  )
}
