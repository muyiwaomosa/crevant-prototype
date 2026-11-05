import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { StoreProvider, useStore } from './state/store'
import { Layout } from './components/Layout'
import { EmptyState, buttonClass } from './components/ui'
import { HomePage } from './pages/HomePage'
import { DiscoverPage } from './pages/DiscoverPage'
import { CreatorPage } from './pages/CreatorPage'
import { PostPage } from './pages/PostPage'
import { RewardsPage } from './pages/RewardsPage'
import { ProfilePage } from './pages/ProfilePage'
import { CreatePage } from './pages/CreatePage'
import { OnboardingPage } from './pages/OnboardingPage'
import { CreatorToolsPage } from './pages/tools/CreatorToolsPage'
import { SELF_ID } from './data/seed'
import { TourBannerProvider } from './components/TourBanner'

function NotFound() {
  return (
    <EmptyState
      icon={<Compass className="h-7 w-7" />}
      title="Page not found"
      body="That page does not exist in this prototype."
      action={
        <Link to="/" className={buttonClass('primary')}>
          Go home
        </Link>
      }
    />
  )
}

/** First time visitors see the welcome once; returning visitors go straight to their feed. */
function HomeGate() {
  const { state } = useStore()
  if (state.onboarding.status === 'pending') return <Navigate to="/welcome" replace />
  return <HomePage />
}

/** Your own profile has one home: /profile. Other people's profiles stay at /creator/:id. */
function CreatorRoute() {
  const { id } = useParams()
  if (id === SELF_ID) return <Navigate to="/profile" replace />
  return <CreatorPage />
}

/** /points moved into Rewards → My CP. Keep any query string. */
function PointsRedirect() {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  params.set('tab', 'cp')
  return <Navigate to={`/rewards?${params.toString()}`} replace />
}

/**
 * The sample-data prototype. On `main` it lives under /tour with a banner
 * saying so. Without a basename it renders at the root, which is only used by
 * the production fallback in `src/entry.ts`.
 */
export default function App({ basename, banner = false }: { basename?: string; banner?: boolean } = {}) {
  return (
    <StoreProvider>
      <TourBannerProvider enabled={banner}>
        <BrowserRouter basename={basename}>
          <Routes>
            <Route path="welcome" element={<OnboardingPage />} />
            <Route element={<Layout />}>
              <Route index element={<HomeGate />} />
              <Route path="discover" element={<DiscoverPage />} />
              <Route path="create" element={<CreatePage />} />
              <Route path="creator/:id" element={<CreatorRoute />} />
              <Route path="post/:id" element={<PostPage />} />
              <Route path="rewards" element={<RewardsPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="profile/tools" element={<CreatorToolsPage />} />

              {/* Routes from the old Fan/Creator modes redirect to their new homes. */}
              <Route path="points" element={<PointsRedirect />} />
              <Route path="studio" element={<Navigate to="/profile/tools" replace />} />
              <Route path="studio/new" element={<Navigate to="/create" replace />} />
              <Route path="studio/posts" element={<Navigate to="/profile" replace />} />
              <Route path="studio/rewards" element={<Navigate to="/profile/tools#rewards" replace />} />

              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TourBannerProvider>
    </StoreProvider>
  )
}
