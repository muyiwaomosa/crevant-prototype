import { Route, Routes } from 'react-router-dom'
import { MemberArea } from './MemberArea'
import { AppNotFound, CatchUpPage, CliquePage, ComposePage, DiscoverPage, FeedPage, MemberPage, PostPage, ProfilePage, SavedPage } from './pages'
import { MySplitPage, RewardsReviewPage } from './split'
import { NoticesPage } from './governance'
import { AdsManagePage } from './ads'
import { ControlCenterPage } from './insights'
import { AdvertisePage, PrivacyPage as MemberPrivacyPage } from './account'
import { ModerationQueuePage, ModerationAppealsPage, ModerationReportPage } from './moderation'
import { FeedbackEntryPage, FeedbackInboxPage, FeedbackPage } from './feedback'
import { VideoTestPage } from './video'
import { WelcomePage } from './pages'

/**
 * Every page of the members area under /app. Loaded on demand by
 * src/public/PublicApp.tsx, so visitors to the landing page, sign in and
 * public previews never download it.
 */
export default function MemberRoutes() {
  return (
    <Routes>
      <Route element={<MemberArea />}>
          <Route index element={<FeedPage />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="new" element={<ComposePage />} />
          <Route path="post/:id" element={<PostPage />} />
          <Route path="u/:username" element={<MemberPage />} />
          <Route path="clique" element={<CliquePage />} />
          <Route path="saved" element={<SavedPage />} />
          <Route path="split" element={<MySplitPage />} />
          <Route path="split/review" element={<RewardsReviewPage />} />
          <Route path="catch-up/:username" element={<CatchUpPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="moderation" element={<ModerationQueuePage />} />
          <Route path="moderation/appeals" element={<ModerationAppealsPage />} />
          <Route path="moderation/:id" element={<ModerationReportPage />} />
          <Route path="notices" element={<NoticesPage />} />
          <Route path="ads" element={<AdsManagePage />} />
          <Route path="control" element={<ControlCenterPage />} />
          <Route path="advertise" element={<AdvertisePage />} />
          <Route path="privacy" element={<MemberPrivacyPage />} />
          <Route path="video-test" element={<VideoTestPage />} />
          <Route path="welcome" element={<WelcomePage />} />
          <Route path="feedback" element={<FeedbackPage />} />
          <Route path="feedback/inbox" element={<FeedbackInboxPage />} />
          <Route path="feedback/inbox/:id" element={<FeedbackEntryPage />} />
          <Route path="*" element={<AppNotFound />} />
      </Route>
    </Routes>
  )
}
