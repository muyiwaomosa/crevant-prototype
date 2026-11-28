import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthProvider'
import { PublicLayout } from './PublicLayout'
import { MemberHostLayout } from './MemberHostLayout'
import { onMemberAppHost } from './member-host'
import { MemberLinksContext } from './member-links'
import { AccountNavLink } from './auth/AccountNavLink'
import { LandingPage } from './LandingPage'
import { RequestInvitePage } from './RequestInvitePage'
import { JoinPage } from './JoinPage'
import { VerifyEmailPage } from './waitlist/VerifyEmailPage'
import { PublicNotFound } from './PublicNotFound'
import { PrivacyPage } from './PrivacyPage'
import { PilotAccessPage } from './PilotAccessPage'
import { SignInPage } from './auth/SignInPage'
import { PublicPostPage } from './PublicPostPage'
import { RegisterPage } from './auth/RegisterPage'
import { ForgotPasswordPage } from './auth/ForgotPasswordPage'
import { ConfirmPage } from './auth/ConfirmPage'
import { SetPasswordPage } from './auth/SetPasswordPage'
import { AccountPage } from './auth/AccountPage'
import { RequireAuth } from './auth/AuthUi'
import { MemberAreaBoundary, MemberAreaLoading } from './MemberAreaLoading'
import { loadMemberRoutes, loadedMemberRoutes } from './memberAreaChunk'

const LazyMemberRoutes = lazy(loadMemberRoutes)

/**
 * The members area: straight away when its code has already arrived (the
 * usual case, since it starts downloading early), otherwise behind a short
 * loading state. Skipping Suspense when it isn't needed also skips React's
 * delay before revealing a suspended page.
 */
function MemberRoutes() {
  // Chosen once: switching later would remount the whole members area.
  const [Loaded] = useState(loadedMemberRoutes)
  if (Loaded) return <Loaded />
  return (
    <Suspense fallback={<MemberAreaLoading />}>
      <LazyMemberRoutes />
    </Suspense>
  )
}

/**
 * The public site, invited members' account pages and the members area
 * (/app: posts, follows, the Clique, likes and comments). There is no sign-up
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

/**
 * Routes without a router or auth provider, so tests can supply their own.
 * On the member app address (app.splitpost.ca) only the member experience is
 * served (MemberHostRoutes); everywhere else (Previews, local) the public site
 * pages are served too, as before.
 */
export function PublicRoutes() {
  return <MemberLinksContext.Provider value>{onMemberAppHost() ? <MemberHostRoutes /> : <AllRoutes />}</MemberLinksContext.Provider>
}

/**
 * The members area (Release 1: the social core), with its own layout. Its
 * code loads only when a member opens /app, so the landing page, sign in and
 * public previews stay small.
 */
function memberAreaRoute() {
  return (
    <Route
      path="app/*"
      element={
        <RequireAuth>
          <MemberAreaBoundary>
            <MemberRoutes />
          </MemberAreaBoundary>
        </RequireAuth>
      }
    />
  )
}

/** Previews and local builds: the public site pages, the account pages and the members area. */
function AllRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout account={<AccountNavLink />} />}>
        <Route index element={<LandingPage />} />
        <Route path="request-invite" element={<RequestInvitePage />} />
        <Route path="join" element={<JoinPage />} />
        <Route path="waitlist/verify" element={<VerifyEmailPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="pilot-access" element={<PilotAccessPage />} />
        {/* The earlier creator and supporter pages now point to the one waitlist. */}
        <Route path="join/creator" element={<Navigate to="/join" replace />} />
        <Route path="join/supporter" element={<Navigate to="/join" replace />} />
        <Route path="sign-in" element={<SignInPage />} />
        <Route path="register/:code?" element={<RegisterPage />} />
        <Route path="p/:id" element={<PublicPostPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="auth/confirm" element={<ConfirmPage />} />
        <Route
          path="auth/set-password"
          element={
            <RequireAuth>
              <SetPasswordPage />
            </RequireAuth>
          }
        />
        <Route
          path="app/account"
          element={
            <RequireAuth>
              <AccountPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<PublicNotFound />} />
      </Route>
      {memberAreaRoute()}
    </Routes>
  )
}

/**
 * The member app address: sign in, password reset, the invitation link
 * (scanner-safe, unchanged), setting a password, the account page, the
 * privacy notice and the members area. Any other path (the landing page, the
 * waitlist, the pilot access page, anything unknown) goes to /app, which asks
 * signed-out visitors to sign in. So client-side navigation can never show a
 * public site page here.
 */
function MemberHostRoutes() {
  return (
    <Routes>
      <Route element={<MemberHostLayout account={<AccountNavLink />} />}>
        <Route path="sign-in" element={<SignInPage />} />
        <Route path="register/:code?" element={<RegisterPage />} />
        <Route path="p/:id" element={<PublicPostPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="auth/confirm" element={<ConfirmPage />} />
        <Route
          path="auth/set-password"
          element={
            <RequireAuth>
              <SetPasswordPage />
            </RequireAuth>
          }
        />
        <Route
          path="app/account"
          element={
            <RequireAuth>
              <AccountPage />
            </RequireAuth>
          }
        />
        <Route path="privacy" element={<PrivacyPage backTo="/app" />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
      {memberAreaRoute()}
    </Routes>
  )
}
