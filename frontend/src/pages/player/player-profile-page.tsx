import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowRight, CalendarDays, LogOut, MapPin, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Label, PhoneInput } from '@/components/ui/input'
import { TournamentStatusBadge } from '@/components/ui/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GoogleSignInButton } from '@/components/auth/google-signin-button'
import { Badge } from '@/components/ui/badge'
import { InitialsAvatar } from '@/components/ui/avatar'
import { CareerStatsSection } from '@/components/player/career-stats-section'
import { EditProfileDialog } from '@/components/player/edit-profile-dialog'
import { ProfileSummary } from '@/components/player/profile-summary'
import { useMyAthleteProfile } from '@/hooks/use-athletes'
import { useCompleteSignup, useGoogleAuth, useMyRegistrations } from '@/hooks/use-player-auth'
import { useSelfRegister } from '@/hooks/use-players'
import { usePublicTournaments } from '@/hooks/use-public'
import { useAuthStore } from '@/stores/auth-store'
import { extractErrorMessage } from '@/lib/api/client'
import { categoryMeta } from '@/lib/tournament-category'
import { formatPlainDate } from '@/lib/utils'
import type { PublicTournamentSummary } from '@/types/api'

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
        <h1 className="font-display text-3xl tracking-tight text-court-cream">My profile</h1>
        <p className="mt-1.5 text-sm text-court-cream/55">Sign in with Google to register for tournaments and track your fixtures.</p>
      </div>

      <Card className="mx-auto max-w-md p-8">
        {!pendingSignup ? (
          <div className="flex flex-col items-center gap-4">
            <GoogleSignInButton onCredential={handleCredential} disabled={googleAuth.isPending} />
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
  const { data: tournaments, isLoading: tournamentsLoading } = usePublicTournaments()
  const { data: athleteProfile, isLoading: athleteLoading } = useMyAthleteProfile(true)
  const [editingProfile, setEditingProfile] = useState(false)

  const registeredIds = new Set((registrations ?? []).map((r) => r.tournament_id))
  const joinable = (tournaments ?? []).filter(
    (t) => (t.status === 'DRAFT' || t.status === 'SCHEDULING') && !registeredIds.has(t.id)
  )
  const upcomingRegistrations = (registrations ?? []).filter((r) => r.tournament_status !== 'COMPLETED')
  // tournament_status is the source of truth for "did this actually finish" -- final_placement/
  // points_earned are both legitimately null/0 for formats with no podium (e.g. TEAM_FRIENDLY)
  // or tournaments completed before points were being tracked, so they can't be used as a proxy.
  const completedHistory = (athleteProfile?.history ?? []).filter((h) => h.tournament_status === 'COMPLETED')
  const categoriesPresent = (athleteProfile?.stats_by_category ?? []).filter((s) => s.tournaments_played > 0)

  return (
    <div className="space-y-8 py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {user && <InitialsAvatar name={user.name} seed={athleteProfile?.id ?? user.id} size="lg" />}
          <div>
            <h1 className="font-display text-3xl tracking-tight text-court-cream">Hey, {user?.name}</h1>
            <p className="mt-1 text-sm text-court-cream/55">{user?.email}</p>
          </div>
        </div>
        <Button variant="outline" onClick={clearSession}>
          <LogOut className="size-4" /> Log out
        </Button>
      </div>

      {athleteProfile && <ProfileSummary profile={athleteProfile} onEdit={() => setEditingProfile(true)} />}
      {athleteProfile && <EditProfileDialog profile={athleteProfile} open={editingProfile} onOpenChange={setEditingProfile} />}

      {athleteLoading ? (
        <div className="h-44 rounded-2xl shimmer-bg" />
      ) : athleteProfile && athleteProfile.tournaments_played > 0 ? (
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
      ) : (
        <EmptyState icon={Trophy} title="No stats yet" description="Play at least 1 tournament to get your stats." />
      )}

      <section>
        <h2 className="mb-3 font-display text-lg text-court-cream">My registrations</h2>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-24 rounded-2xl shimmer-bg" />
            <div className="h-24 rounded-2xl shimmer-bg" />
          </div>
        ) : upcomingRegistrations.length === 0 ? (
          <EmptyState icon={Trophy} title="No upcoming registrations" description="Join a tournament below to get started." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {upcomingRegistrations.map((r) => (
              <Link key={r.player_id} to={`/tournaments/${r.tournament_id}`} className="block active:scale-[0.98]">
                <Card className="p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-base text-court-cream">{r.tournament_name}</p>
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
        <h2 className="mb-3 font-display text-lg text-court-cream">Tournaments you can join</h2>
        {tournamentsLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-24 rounded-2xl shimmer-bg" />
            <div className="h-24 rounded-2xl shimmer-bg" />
          </div>
        ) : joinable.length === 0 ? (
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

function JoinableTournamentCard({ tournament }: { tournament: PublicTournamentSummary }) {
  const selfRegister = useSelfRegister(tournament.id)

  return (
    <Card className="p-4">
      <p className="font-display text-base text-court-cream">{tournament.name}</p>
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
