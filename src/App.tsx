import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { StoreProvider } from './state/store'
import { Layout } from './components/Layout'
import { EmptyState, buttonClass } from './components/ui'
import { HomePage } from './pages/HomePage'
import { DiscoverPage } from './pages/DiscoverPage'
import { CreatorPage } from './pages/CreatorPage'
import { PostPage } from './pages/PostPage'
import { PointsPage } from './pages/PointsPage'
import { RewardsPage } from './pages/RewardsPage'
import { ProfilePage } from './pages/ProfilePage'
import { StudioOverview } from './pages/studio/StudioOverview'
import { StudioCreate } from './pages/studio/StudioCreate'
import { StudioPosts } from './pages/studio/StudioPosts'
import { StudioRewards } from './pages/studio/StudioRewards'
import { Compass } from 'lucide-react'

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

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="discover" element={<DiscoverPage />} />
            <Route path="creator/:id" element={<CreatorPage />} />
            <Route path="post/:id" element={<PostPage />} />
            <Route path="points" element={<PointsPage />} />
            <Route path="rewards" element={<RewardsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="studio" element={<StudioOverview />} />
            <Route path="studio/new" element={<StudioCreate />} />
            <Route path="studio/posts" element={<StudioPosts />} />
            <Route path="studio/rewards" element={<StudioRewards />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  )
}
