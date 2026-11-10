import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PublicLayout } from '../public/PublicLayout'
import { LandingPage } from '../public/LandingPage'
import { JoinPage } from '../public/JoinPage'
import { PublicNotFound } from '../public/PublicNotFound'

/**
 * The public site build: the landing page and /join only (the sample tour is
 * served separately under /tour). There are no member pages here at all:
 * sign in, password, confirmation and account paths fall through to the
 * public "not found" page, and no auth or Supabase client code is imported.
 * scripts/check-site-bundle.mjs fails the build if any of it slips in.
 */
export function SiteApp() {
  return (
    <BrowserRouter>
      <SiteRoutes />
    </BrowserRouter>
  )
}

/** Routes without a router, so tests can supply their own. */
export function SiteRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="join" element={<JoinPage />} />
        <Route path="join/creator" element={<Navigate to="/join" replace />} />
        <Route path="join/supporter" element={<Navigate to="/join" replace />} />
        <Route path="request-invite" element={<Navigate to="/join" replace />} />
        <Route path="*" element={<PublicNotFound />} />
      </Route>
    </Routes>
  )
}
