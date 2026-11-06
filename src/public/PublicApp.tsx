import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { PublicLayout } from './PublicLayout'
import { LandingPage } from './LandingPage'
import { RequestInvitePage } from './RequestInvitePage'
import { SignInPage } from './SignInPage'
import { PublicNotFound } from './PublicNotFound'

/**
 * The public site. It has no sign in, no forms and no backend yet: nothing
 * here collects personal information until the privacy notice is approved.
 */
export function PublicApp() {
  return (
    <BrowserRouter>
      <PublicRoutes />
    </BrowserRouter>
  )
}

/** Routes without a router, so tests can use a MemoryRouter. */
export function PublicRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="request-invite" element={<RequestInvitePage />} />
        <Route path="sign-in" element={<SignInPage />} />
        <Route path="*" element={<PublicNotFound />} />
      </Route>
    </Routes>
  )
}
