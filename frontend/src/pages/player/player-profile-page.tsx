import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowRight, CalendarDays, LogOut, MapPin, Medal, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Label, PhoneInput } from '@/components/ui/input'
import { TournamentStatusBadge } from '@/components/ui/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GoogleSignInButton } from '@/components/auth/google-signin-button'
import { Badge } from '@/components/ui/badge'
import { useMyAthleteProfile } from '@/hooks/use-athletes'
import { useCompleteSignup, useGoogleAuth, useMyRegistrations } from '@/hooks/use-player-auth'
import { useSelfRegister } from '@/hooks/use-players'
import { usePublicTournaments } from '@/hooks/use-public'
import { useAuthStore } from '@/stores/auth-store'
import { extractErrorMessage } from '@/lib/api/client'
import { categoryMeta } from '@/lib/tournament-category'
import { formatMeta } from '@/lib/tournament-format'
import { cn, formatPlainDate } from '@/lib/utils'
import type { AthleteTournamentHistoryEntry, PublicTournamentSummary, TournamentFormat } from '@/types/api'

const PHONE_RE = /^[6-9]\d{9}$/

export function PlayerProfilePage() {
  const user = useAuthStore((s) => s.user)
  const isPlayer = user?.role === 'PLAYER'

  return <div className="mx-auto max-w-3xl">{isPlayer ? <LoggedInView /> : <LoggedOutView />}</div>
}

// =====================================================================
// LOGGED OUT: GOOGLE SIGN-IN
// =====================================================================
function LoggedOutView() {
  const setSession = useAuthStore((s) => s.setSession)
  const [pendingSignup, setPendingSignup] = useState<{ signupToken: string; name: string | null } | null>(null)
  const [phone, setPhone] = useState('')
  const googleAuth = useGoogleAuth()
  const completeSignup = useCompleteSignup()

  function handleCredential(idToken: string) {
    googleAuth.mutate(idToken, {
      onSuccess: (res) => {
        if (res.account_exists && res.session) {
          setSession(res.session)
          toast.success('Welcome back!')
        } else if (res.signup_token) {
          setPendingSignup({ signupToken: res.signup_token, name: res.name })
        }
      },
      onError: (err) => toast.error(extractErrorMessage(err)),
    })
  }

  return (
    <div className="py-6">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-medium text-court-cream">My profile</h1>
        <p className="mt-1.5 text-sm text-court-cream/55">Sign in with Google to register for tournaments and track your fixtures.</p>
      </div>

      <Card className="mx-auto max-w-md p-8">
        {!pendingSignup ? (
          <div className="flex flex-col items-center gap-4">
            <GoogleSignInButton onCredential={handleCredential} disabled={googleAuth.isPending} />
            <Link to="/players/claim-email" className="text-xs font-medium text-court-cream/45 underline">
              Already played with us? Set up your email
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-center text-sm text-court-cream/55">
              Hey {pendingSignup.name ?? 'there'} — one last thing. What's your phone number?
            </p>
            <div className="space-y-1.5">
              <Label>Phone number</Label>
              <PhoneInput value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
            </div>
            <Button
              className="w-full"
              disabled={!PHONE_RE.test(phone)}
              loading={completeSignup.isPending}
              onClick={() =>
                completeSignup.mutate(
                  { signupToken: pendingSignup.signupToken, phone },
                  {
                    onSuccess: (res) =>
                      toast.success(
                        res.claimed_existing_record
                          ? "Welcome! We found you on an existing tournament roster and linked your account."
                          : 'Welcome!'
                      ),
                    onError: (err) => toast.error(extractErrorMessage(err)),
                  }
                )
              }
            >
              Create account
            </Button>
          </div>
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
          <h1 className="font-display text-3xl font-medium text-court-cream">Hey, {user?.name}</h1>
          <p className="mt-1 text-sm text-court-cream/55">{user?.email}</p>
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
        <h2 className="mb-3 font-display text-lg font-medium text-court-cream">My registrations</h2>
        {!isLoading && upcomingRegistrations.length === 0 ? (
          <EmptyState icon={Trophy} title="No upcoming registrations" description="Join a tournament below to get started." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {upcomingRegistrations.map((r) => (
              <Link key={r.player_id} to={`/tournaments/${r.tournament_id}`}>
                <Card className="p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-base font-medium text-court-cream">{r.tournament_name}</p>
                    <TournamentStatusBadge status={r.tournament_status} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-court-cream/55">
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
        <h2 className="mb-3 font-display text-lg font-medium text-court-cream">Tournaments you can join</h2>
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
            <LegendRow colorClassName="bg-white/10" label="Lost" value={stats.matches_lost} />
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
          <StatTile value={stats.tournaments_played} label="Tournaments played" />
          <StatTile value={stats.matches_played} label="Matches played" />
        </div>
      </Card>

      {history.length > 0 && <FormatBreakdownChart history={history} />}
      {history.length > 0 && <TournamentHistoryChart history={history} />}
    </div>
  )
}

function StatTile({ value, label }: { value: number | string; label: string }) {
  return (
    <Card className="p-3 text-center sm:p-4">
      <p className="font-display text-2xl font-medium tracking-tight text-court-cream sm:text-3xl">{value}</p>
      <p className="mt-1 text-[11px] font-semibold text-court-cream/55 sm:text-xs">{label}</p>
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
        <span className="font-display text-2xl font-medium text-court-cream">{winRate}%</span>
        <span className="text-[10px] font-semibold text-court-cream/55">win rate</span>
      </div>
    </div>
  )
}

function LegendRow({ colorClassName, label, value }: { colorClassName: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={cn('size-2.5 rounded-full', colorClassName)} />
      <span className="text-court-cream/55">{label}</span>
      <span className="font-semibold text-court-cream">{value}</span>
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
      <h2 className="mb-3 font-display text-lg font-medium text-court-cream">Tournament history</h2>
      <Card className="divide-y divide-white/10 p-0">
        {history.map((h) => (
          <div key={h.tournament_id} className="flex items-center gap-3 p-4">
            <div className="w-24 shrink-0 sm:w-40">
              <p className="line-clamp-2 text-sm font-medium leading-tight text-court-cream">{h.tournament_name}</p>
              <p className="mt-0.5 text-xs text-court-cream/55">{formatHistoryDate(h.tournament_date)}</p>
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-ember-500 transition-[width] duration-500"
                style={{ width: `${(h.points_earned / maxPoints) * 100}%` }}
              />
            </div>
            <div className="flex w-16 shrink-0 items-center justify-end gap-1.5 text-xs font-semibold text-court-cream/70">
              {h.final_placement === 1 && <Trophy className="size-3.5 text-ember-500" />}
              {h.final_placement !== null && h.final_placement > 1 && h.final_placement <= 3 && (
                <Medal className="size-3.5 text-court-cream/45" />
              )}
              {h.points_earned} pts
            </div>
          </div>
        ))}
      </Card>
    </section>
  )
}

function FormatBreakdownChart({ history }: { history: AthleteTournamentHistoryEntry[] }) {
  const total = history.length
  const counts = history.reduce<Partial<Record<TournamentFormat, number>>>((acc, h) => {
    acc[h.format] = (acc[h.format] ?? 0) + 1
    return acc
  }, {})
  const formats = (Object.keys(counts) as TournamentFormat[]).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))

  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-medium text-court-cream">Formats played</h2>
      <Card className="divide-y divide-white/10 p-0">
        {formats.map((format) => {
          const meta = formatMeta[format]
          const count = counts[format] ?? 0
          const percentage = Math.round((count / total) * 100)
          const Icon = meta.icon
          return (
            <div key={format} className="flex items-center gap-3 p-4">
              <div className="flex w-28 shrink-0 items-center gap-2 sm:w-44">
                <Icon className="size-4 shrink-0 text-court-cream/55" />
                <p className="line-clamp-2 text-sm font-medium leading-tight text-court-cream">{meta.label}</p>
              </div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn('h-full rounded-full transition-[width] duration-500', meta.barClassName)}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="w-20 shrink-0 text-right text-xs font-semibold text-court-cream/70">
                {percentage}% <span className="text-court-cream/45">({count})</span>
              </div>
            </div>
          )
        })}
      </Card>
    </section>
  )
}

function JoinableTournamentCard({ tournament }: { tournament: PublicTournamentSummary }) {
  const selfRegister = useSelfRegister(tournament.id)

  return (
    <Card className="p-4">
      <p className="font-display text-base font-medium text-court-cream">{tournament.name}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-court-cream/55">
        <span className="flex items-center gap-1.5">
          <MapPin className="size-3.5" /> {tournament.venue ?? 'Venue TBD'}
        </span>
        {tournament.tournament_date && (
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" /> {formatPlainDate(tournament.tournament_date)}
          </span>
        )}
      </div>
      {tournament.registration_status === 'OPEN' ? (
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
      ) : (
        <Badge variant="neutral" className="mt-3 w-full justify-center py-2">
          {tournament.registration_status === 'CLOSED' ? 'Registrations are closed' : 'Registrations will open soon'}
        </Badge>
      )}
    </Card>
  )
}
