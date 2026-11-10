import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthProvider'
import { PublicLayout } from './PublicLayout'
import { MemberLinksContext } from './member-links'
import { AccountNavLink } from './auth/AccountNavLink'
import { LandingPage } from './LandingPage'
import { RequestInvitePage } from './RequestInvitePage'
import { JoinPage } from './JoinPage'
import { PublicNotFound } from './PublicNotFound'
import { PrivacyPage } from './PrivacyPage'
import { SignInPage } from './auth/SignInPage'
import { ForgotPasswordPage } from './auth/ForgotPasswordPage'
import { ConfirmPage } from './auth/ConfirmPage'
import { SetPasswordPage } from './auth/SetPasswordPage'
import { AppHomePage } from './auth/AppHomePage'
import { AccountPage } from './auth/AccountPage'
import { RequireAuth } from './auth/AuthUi'

/**
 * The public site and invited members' account pages. There is no sign-up
 * page: accounts are created by invitation only. The invitation request form
 * stays closed until the privacy notice is approved.
 */
export function PublicApp() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PublicRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}

/** Routes without a router or auth provider, so tests can supply their own. */
export function PublicRoutes() {
  return (
    <MemberLinksContext.Provider value>
      <Routes>
        <Route element={<PublicLayout account={<AccountNavLink />} />}>
        <Route index element={<LandingPage />} />
        <Route path="request-invite" element={<RequestInvitePage />} />
        <Route path="join" element={<JoinPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        {/* The earlier creator and supporter pages now point to the one waitlist. */}
        <Route path="join/creator" element={<Navigate to="/join" replace />} />
        <Route path="join/supporter" element={<Navigate to="/join" replace />} />
        <Route path="sign-in" element={<SignInPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="auth/confirm" element={<ConfirmPage />} />
        <Route path="auth/set-password" element={<RequireAuth><SetPasswordPage /></RequireAuth>} />
        <Route path="app" element={<RequireAuth><AppHomePage /></RequireAuth>} />
        <Route path="app/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
        <Route path="*" element={<PublicNotFound />} />
        </Route>
      </Routes>
    </MemberLinksContext.Provider>
  )
}
