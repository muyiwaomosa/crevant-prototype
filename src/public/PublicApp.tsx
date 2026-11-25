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
import { PublicNotFound } from './PublicNotFound'
import { PrivacyPage } from './PrivacyPage'
import { PilotAccessPage } from './PilotAccessPage'
import { SignInPage } from './auth/SignInPage'
import { RegisterPage } from './auth/RegisterPage'
import { ForgotPasswordPage } from './auth/ForgotPasswordPage'
import { ConfirmPage } from './auth/ConfirmPage'
import { SetPasswordPage } from './auth/SetPasswordPage'
import { AccountPage } from './auth/AccountPage'
import { RequireAuth } from './auth/AuthUi'
import { MemberArea } from '../app/MemberArea'
import { AppNotFound, CatchUpPage, CliquePage, ComposePage, DiscoverPage, FeedPage, MemberPage, PostPage, ProfilePage } from '../app/pages'
import { MySplitPage } from '../app/split'
import { ModerationQueuePage, ModerationReportPage } from '../app/moderation'
import { FeedbackEntryPage, FeedbackInboxPage, FeedbackPage } from '../app/feedback'

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

/** The members area (Release 1: the social core), with its own layout. */
function memberAreaRoute() {
  return (
    <Route path="app" element={<RequireAuth><MemberArea /></RequireAuth>}>
      <Route index element={<FeedPage />} />
      <Route path="discover" element={<DiscoverPage />} />
      <Route path="new" element={<ComposePage />} />
      <Route path="post/:id" element={<PostPage />} />
      <Route path="u/:username" element={<MemberPage />} />
      <Route path="clique" element={<CliquePage />} />
      <Route path="split" element={<MySplitPage />} />
      <Route path="catch-up/:username" element={<CatchUpPage />} />
      <Route path="profile" element={<ProfilePage />} />
      <Route path="moderation" element={<ModerationQueuePage />} />
      <Route path="moderation/:id" element={<ModerationReportPage />} />
      <Route path="feedback" element={<FeedbackPage />} />
      <Route path="feedback/inbox" element={<FeedbackInboxPage />} />
      <Route path="feedback/inbox/:id" element={<FeedbackEntryPage />} />
      <Route path="*" element={<AppNotFound />} />
    </Route>
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
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="pilot-access" element={<PilotAccessPage />} />
        {/* The earlier creator and supporter pages now point to the one waitlist. */}
        <Route path="join/creator" element={<Navigate to="/join" replace />} />
        <Route path="join/supporter" element={<Navigate to="/join" replace />} />
        <Route path="sign-in" element={<SignInPage />} />
        <Route path="register/:code?" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="auth/confirm" element={<ConfirmPage />} />
        <Route path="auth/set-password" element={<RequireAuth><SetPasswordPage /></RequireAuth>} />
        <Route path="app/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
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
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="auth/confirm" element={<ConfirmPage />} />
        <Route path="auth/set-password" element={<RequireAuth><SetPasswordPage /></RequireAuth>} />
        <Route path="app/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
        <Route path="privacy" element={<PrivacyPage backTo="/app" />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
      {memberAreaRoute()}
    </Routes>
  )
}
