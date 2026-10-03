import { Link } from 'react-router-dom'
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google'
import { toast } from 'sonner'
import { ArrowRight, CalendarDays, LogOut, MapPin, Medal, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { TournamentStatusBadge } from '@/components/ui/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMyAthleteProfile } from '@/hooks/use-athletes'
import { useGooglePlayerLogin, useMyRegistrations } from '@/hooks/use-player-auth'
import { useSelfRegister } from '@/hooks/use-players'
import { usePublicTournaments } from '@/hooks/use-public'
import { useAuthStore } from '@/stores/auth-store'
import { extractErrorMessage } from '@/lib/api/client'
import { categoryMeta } from '@/lib/tournament-category'
import { cn, formatPlainDate } from '@/lib/utils'
import type { AthleteTournamentHistoryEntry, PublicTournamentSummary } from '@/types/api'

export function PlayerProfilePage() {
  const user = useAuthStore((s) => s.user)
  const isPlayer = user?.role === 'PLAYER'

  return <div className="mx-auto max-w-3xl">{isPlayer ? <LoggedInView /> : <LoggedOutView />}</div>
}

// =====================================================================
// LOGGED OUT: GOOGLE SIGN-IN
// =====================================================================
function LoggedOutView() {
  const googleLogin = useGooglePlayerLogin()
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  return (
    <div className="py-6">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-medium text-navy-900">My profile</h1>
        <p className="mt-1.5 text-sm text-navy-500">Sign in with Google to register for tournaments and track your fixtures.</p>
      </div>

      <Card className="mx-auto flex max-w-md flex-col items-center gap-3 p-8">
        {!clientId ? (
          <p className="text-center text-sm text-navy-500">
            Google sign-in isn't configured yet — set <code>VITE_GOOGLE_CLIENT_ID</code> in{' '}
            <code>frontend/.env</code>.
          </p>
        ) : (
          <GoogleOAuthProvider clientId={clientId}>
            <GoogleLogin
              onSuccess={(credentialResponse) => {
                if (!credentialResponse.credential) return
                googleLogin.mutate(credentialResponse.credential, {
                  onSuccess: (res) =>
                    toast.success(
                      res.claimed_existing_record
                        ? "Welcome! We found you on an existing tournament roster and linked your account."
                        : 'Welcome!'
                    ),
                  onError: (err) => toast.error(extractErrorMessage(err)),
                })
              }}
              onError={() => toast.error('Google sign-in failed. Please try again.')}
            />
          </GoogleOAuthProvider>
        )}
      </Card>
    </div>
  )
}

// =====================================================================
// LOGGED IN: MY REGISTRATIONS + BROWSE TO JOIN
// =====================================================================
function LoggedInView() {
  const user = useAuthStore((s) => s.user)
  const clearSession = useAuthStore((s) => s.clearSession)
  const { data: registrations, isLoading } = useMyRegistrations(true)
  const { data: tournaments } = usePublicTournaments()
  const { data: athleteProfile } = useMyAthleteProfile(true)

  const registeredIds = new Set((registrations ?? []).map((r) => r.tournament_id))
  const joinable = (tournaments ?? []).filter(
    (t) => (t.status === 'DRAFT' || t.status === 'SCHEDULING') && !registeredIds.has(t.id)
  )
  const upcomingRegistrations = (registrations ?? []).filter((r) => r.tournament_status !== 'COMPLETED')
  const completedHistory = (athleteProfile?.history ?? []).filter(
    (h) => h.final_placement !== null || h.points_earned > 0
  )
  const categoriesPresent = (athleteProfile?.stats_by_category ?? []).filter((s) => s.tournaments_played > 0)

  return (
    <div className="space-y-8 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium text-navy-900">Hey, {user?.name}</h1>
          <p className="mt-1 text-sm text-navy-500">{user?.email}</p>
        </div>
        <Button variant="outline" onClick={clearSession}>
          <LogOut className="size-4" /> Log out
        </Button>
      </div>

      {athleteProfile && athleteProfile.tournaments_played > 0 && (
        <Tabs defaultValue="ALL">
          <TabsList>
            <TabsTrigger value="ALL">All</TabsTrigger>
            {categoriesPresent.map((s) => (
              <TabsTrigger key={s.category ?? 'UNCATEGORIZED'} value={s.category ?? 'UNCATEGORIZED'}>
                {s.category ? categoryMeta[s.category].label : 'Other'}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="ALL">
            <CareerStatsSection stats={athleteProfile} history={completedHistory} />
          </TabsContent>
          {categoriesPresent.map((s) => (
            <TabsContent key={s.category ?? 'UNCATEGORIZED'} value={s.category ?? 'UNCATEGORIZED'}>
              <CareerStatsSection stats={s} history={completedHistory.filter((h) => h.category === s.category)} />
            </TabsContent>
          ))}
        </Tabs>
      )}

      <section>
        <h2 className="mb-3 font-display text-lg font-medium text-navy-900">My registrations</h2>
        {!isLoading && upcomingRegistrations.length === 0 ? (
          <EmptyState icon={Trophy} title="No upcoming registrations" description="Join a tournament below to get started." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {upcomingRegistrations.map((r) => (
              <Link key={r.player_id} to={`/tournaments/${r.tournament_id}`}>
                <Card className="p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-base font-medium text-navy-900">{r.tournament_name}</p>
                    <TournamentStatusBadge status={r.tournament_status} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-navy-500">
                    {r.venue && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="size-3.5" /> {r.venue}
                      </span>
                    )}
                    {r.tournament_date && (
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" /> {formatPlainDate(r.tournament_date)}
                      </span>
                    )}
                  </div>
                  {r.is_withdrawn && <p className="mt-2 text-xs font-semibold text-danger">You've withdrawn</p>}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-medium text-navy-900">Tournaments you can join</h2>
        {joinable.length === 0 ? (
          <EmptyState icon={Trophy} title="Nothing open right now" description="Check back once a new tournament opens registration." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {joinable.map((t) => (
              <JoinableTournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

interface CareerStats {
  tournaments_played: number
  matches_played: number
  matches_won: number
  matches_lost: number
  win_rate_percentage: number
}

function CareerStatsSection({ stats, history }: { stats: CareerStats; history: AthleteTournamentHistoryEntry[] }) {
  return (
    <div className="space-y-6">
      <Card className="flex flex-col items-center gap-6 p-5 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-5">
          <WinRateDonut winRate={stats.win_rate_percentage} />
          <div className="flex flex-col gap-2">
            <LegendRow colorClassName="bg-ember-500" label="Won" value={stats.matches_won} />
            <LegendRow colorClassName="bg-navy-100" label="Lost" value={stats.matches_lost} />
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
          <StatTile value={stats.tournaments_played} label="Tournaments played" />
          <StatTile value={stats.matches_played} label="Matches played" />
        </div>
      </Card>

      {history.length > 0 && <TournamentHistoryChart history={history} />}
    </div>
  )
}

function StatTile({ value, label }: { value: number | string; label: string }) {
  return (
    <Card className="p-3 text-center sm:p-4">
      <p className="font-display text-2xl font-medium tracking-tight text-navy-900 sm:text-3xl">{value}</p>
      <p className="mt-1 text-[11px] font-semibold text-navy-500 sm:text-xs">{label}</p>
    </Card>
  )
}

function WinRateDonut({ winRate }: { winRate: number }) {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (circumference * Math.min(Math.max(winRate, 0), 100)) / 100

  return (
    <div className="relative flex size-28 shrink-0 items-center justify-center">
      <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
        <circle cx="56" cy="56" r={radius} fill="none" stroke="var(--color-navy-100)" strokeWidth="11" />
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="var(--color-ember-500)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-2xl font-medium text-navy-900">{winRate}%</span>
        <span className="text-[10px] font-semibold text-navy-500">win rate</span>
      </div>
    </div>
  )
}

function LegendRow({ colorClassName, label, value }: { colorClassName: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={cn('size-2.5 rounded-full', colorClassName)} />
      <span className="text-navy-500">{label}</span>
      <span className="font-semibold text-navy-900">{value}</span>
    </div>
  )
}

function formatHistoryDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function TournamentHistoryChart({ history }: { history: AthleteTournamentHistoryEntry[] }) {
  const maxPoints = Math.max(...history.map((h) => h.points_earned), 1)

  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-medium text-navy-900">Tournament history</h2>
      <Card className="divide-y divide-cream-200 p-0">
        {history.map((h) => (
          <div key={h.tournament_id} className="flex items-center gap-3 p-4">
            <div className="w-24 shrink-0 sm:w-40">
              <p className="line-clamp-2 text-sm font-medium leading-tight text-navy-900">{h.tournament_name}</p>
              <p className="mt-0.5 text-xs text-navy-500">{formatHistoryDate(h.tournament_date)}</p>
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-navy-100">
              <div
                className="h-full rounded-full bg-ember-500 transition-[width] duration-500"
                style={{ width: `${(h.points_earned / maxPoints) * 100}%` }}
              />
            </div>
            <div className="flex w-16 shrink-0 items-center justify-end gap-1.5 text-xs font-semibold text-navy-700">
              {h.final_placement === 1 && <Trophy className="size-3.5 text-ember-500" />}
              {h.final_placement !== null && h.final_placement > 1 && h.final_placement <= 3 && (
                <Medal className="size-3.5 text-navy-400" />
              )}
              {h.points_earned} pts
            </div>
          </div>
        ))}
      </Card>
    </section>
  )
}

function JoinableTournamentCard({ tournament }: { tournament: PublicTournamentSummary }) {
  const selfRegister = useSelfRegister(tournament.id)

  return (
    <Card className="p-4">
      <p className="font-display text-base font-medium text-navy-900">{tournament.name}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-navy-500">
        <span className="flex items-center gap-1.5">
          <MapPin className="size-3.5" /> {tournament.venue ?? 'Venue TBD'}
        </span>
        {tournament.tournament_date && (
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" /> {formatPlainDate(tournament.tournament_date)}
          </span>
        )}
      </div>
      <Button
        className="mt-3 w-full"
        size="sm"
        loading={selfRegister.isPending}
        onClick={() =>
          selfRegister.mutate(undefined, {
            onSuccess: () => toast.success('Registered! See you on court.'),
            onError: (err) => toast.error(extractErrorMessage(err)),
          })
        }
      >
        Register <ArrowRight className="size-3.5" />
      </Button>
    </Card>
  )
}
