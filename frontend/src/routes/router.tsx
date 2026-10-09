import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/app-shell'
import { OperatorShell } from '@/components/layout/operator-shell'
import { PublicShell } from '@/components/layout/public-shell'
import { ProtectedRoute } from './protected-route'
import { FullPageSpinner } from '@/components/ui/spinner'

const AuthPage = lazy(() => import('@/pages/auth/auth-page').then((m) => ({ default: m.AuthPage })))
const DashboardPage = lazy(() => import('@/pages/organiser/dashboard-page').then((m) => ({ default: m.DashboardPage })))
const CreateTournamentPage = lazy(() =>
  import('@/pages/organiser/create-tournament-page').then((m) => ({ default: m.CreateTournamentPage }))
)
const TournamentDetailPage = lazy(() =>
  import('@/pages/organiser/tournament-detail-page').then((m) => ({ default: m.TournamentDetailPage }))
)
const OperatorMatchesPage = lazy(() =>
  import('@/pages/operator/operator-matches-page').then((m) => ({ default: m.OperatorMatchesPage }))
)
const LandingPage = lazy(() => import('@/pages/public/landing-page').then((m) => ({ default: m.LandingPage })))
const AboutPage = lazy(() => import('@/pages/public/about-page').then((m) => ({ default: m.AboutPage })))
const TournamentsBrowsePage = lazy(() =>
  import('@/pages/public/tournaments-browse-page').then((m) => ({ default: m.TournamentsBrowsePage }))
)
const TournamentLivePage = lazy(() =>
  import('@/pages/public/tournament-live-page').then((m) => ({ default: m.TournamentLivePage }))
)
const PlayerProfilePage = lazy(() =>
  import('@/pages/player/player-profile-page').then((m) => ({ default: m.PlayerProfilePage }))
)
const ClaimEmailPage = lazy(() =>
  import('@/pages/player/claim-email-page').then((m) => ({ default: m.ClaimEmailPage }))
)

function suspended(element: React.ReactNode) {
  return <Suspense fallback={<FullPageSpinner />}>{element}</Suspense>
}

export const router = createBrowserRouter([
  { path: '/login', element: suspended(<AuthPage />) },
  {
    element: <PublicShell />,
    children: [
      { path: '/', element: suspended(<LandingPage />) },
      { path: '/about', element: suspended(<AboutPage />) },
      { path: '/tournaments', element: suspended(<TournamentsBrowsePage />) },
      { path: '/tournaments/:id', element: suspended(<TournamentLivePage />) },
      { path: '/players', element: suspended(<PlayerProfilePage />) },
      { path: '/players/claim-email', element: suspended(<ClaimEmailPage />) },
    ],
  },
  {
    element: <ProtectedRoute allow="ORGANISER" />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/organiser', element: suspended(<DashboardPage />) },
          { path: '/organiser/new', element: suspended(<CreateTournamentPage />) },
          { path: '/organiser/:id', element: suspended(<TournamentDetailPage />) },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute allow="OPERATOR" />,
    children: [
      {
        element: <OperatorShell />,
        children: [{ path: '/operator', element: suspended(<OperatorMatchesPage />) }],
      },
    ],
  },
  {
    element: <ProtectedRoute allow="ORGANISER" />,
    children: [
      {
        element: <OperatorShell />,
        children: [{ path: '/organiser/:id/operate', element: suspended(<OperatorMatchesPage />) }],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
