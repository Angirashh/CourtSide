import { useMemo } from 'react'
import { CalendarClock, Clock, MapPin } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { MatchStatusBadge } from '@/components/ui/status-badge'
import { VsBadge } from '@/components/ui/vs-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUrlParam } from '@/hooks/use-url-param'
import { cn, formatCurrency, formatDate, formatDuration, formatTime, playerLabel } from '@/lib/utils'
import type { Court, Match, TournamentDetail } from '@/types/api'

interface ScheduleItem {
  id: string
  court_id: string | null
  stage: string
  game_label: string
  round_num: number
  scheduled_start_time: string
  scheduled_end_time: string
  status: Match['status']
  left: string
  right: string
  winner: string | null
  leftId: string | null
  rightId: string | null
}

const stageLabel: Record<Match['stage'], string> = {
  GROUP: 'Group',
  SWISS: 'Swiss',
  KNOCKOUT: 'Knockout',
  CROSSOVER: 'Crossover',
}

export function ScheduleSummaryTab({ tournament }: { tournament: TournamentDetail }) {
  const playersById = useMemo(() => new Map(tournament.players.map((p) => [p.id, p])), [tournament.players])
  const teamsById = useMemo(() => new Map(tournament.teams.map((team) => [team.id, team.name])), [tournament.teams])

  const scheduledMatches = useMemo(
    (): ScheduleItem[] => tournament.tournament_type === 'TEAM'
      ? tournament.team_ties.flatMap((tie) => tie.games.filter((game) => game.scheduled_start_time && game.scheduled_end_time).map((game) => ({
          id: game.id,
          court_id: game.court_id,
          stage: tie.group_id?.replaceAll('_', ' ') ?? tie.stage,
          game_label: `${game.match_type.toLowerCase()} ${game.order_num}`,
          round_num: tie.round_num,
          scheduled_start_time: game.scheduled_start_time!,
          scheduled_end_time: game.scheduled_end_time!,
          status: game.status,
          left: teamsById.get(tie.team1_id ?? '') ?? 'To be decided',
          right: teamsById.get(tie.team2_id ?? '') ?? 'To be decided',
          winner: game.winner_team_id,
          leftId: tie.team1_id,
          rightId: tie.team2_id,
        })))
      : tournament.matches.filter((m) => m.scheduled_start_time && m.scheduled_end_time).map((m) => ({
          id: m.id,
          court_id: m.court_id,
          stage: m.stage,
          game_label: '',
          round_num: m.round_num,
          scheduled_start_time: m.scheduled_start_time!,
          scheduled_end_time: m.scheduled_end_time!,
          status: m.status,
          left: playerLabel(m.player1_id, playersById),
          right: playerLabel(m.player2_id, playersById),
          winner: m.winner_id,
          leftId: m.player1_id,
          rightId: m.player2_id,
        })),
    [tournament.tournament_type, tournament.team_ties, tournament.matches, teamsById, playersById]
  )

  const matchesByCourt = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>()
    for (const court of tournament.courts) map.set(court.id, [])
    for (const m of scheduledMatches) {
      if (!m.court_id) continue
      if (!map.has(m.court_id)) map.set(m.court_id, [])
      map.get(m.court_id)!.push(m)
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.scheduled_start_time ?? '').localeCompare(b.scheduled_start_time ?? ''))
    }
    return map
  }, [tournament.courts, scheduledMatches])
  // Hooks must run unconditionally on every render, so this is read up front even though
  // only the generated-schedule branch below actually uses it.
  const [activeCourtId, setActiveCourtId] = useUrlParam('court', tournament.courts[0]?.id ?? '')

  if (scheduledMatches.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No schedule generated yet"
        description="Generate a schedule to see the tournament’s total duration, each court’s timetable, and how much the optimiser saves over booking every court all day."
      />
    )
  }

  const overallStart = new Date(Math.min(...scheduledMatches.map((m) => new Date(m.scheduled_start_time).getTime())))
  const overallEnd = new Date(Math.max(...scheduledMatches.map((m) => new Date(m.scheduled_end_time).getTime())))
  const durationMinutes = Math.round((overallEnd.getTime() - overallStart.getTime()) / 60000)
  const summary = tournament.schedule_summary

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Clock} label="Duration" value={formatDuration(durationMinutes)} sub={formatDate(overallStart.toISOString())} />
        <StatCard icon={CalendarClock} label="Play window" value={`${formatTime(overallStart.toISOString())} – ${formatTime(overallEnd.toISOString())}`} />
      </div>

      <Tabs value={activeCourtId} onValueChange={setActiveCourtId}>
        <TabsList>
          {tournament.courts.map((court) => (
            <TabsTrigger key={court.id} value={court.id} className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" aria-hidden="true" />
              {court.name}
              <span className="opacity-60">({matchesByCourt.get(court.id)?.length ?? 0})</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {tournament.courts.map((court) => (
          <TabsContent key={court.id} value={court.id}>
            <CourtScheduleCard
              court={court}
              matches={matchesByCourt.get(court.id) ?? []}
              booking={summary?.court_bookings[court.id]}
              isTeam={tournament.tournament_type === 'TEAM'}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <Card className={cn('p-3 sm:p-4', accent && 'border-ember-300/60 bg-ember-500/10')}>
      <div className="flex items-center gap-2.5">
        <div className={cn('hidden size-8 shrink-0 items-center justify-center rounded-lg sm:flex', accent ? 'bg-ember-500 text-ink' : 'bg-white/10 text-court-cream/60')}>
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className={cn('font-display text-base leading-tight sm:truncate sm:text-lg sm:leading-none', accent ? 'text-ember-600' : 'text-court-cream')}>{value}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-court-cream/45">{label}</p>
        </div>
      </div>
      {sub && <p className="mt-2 text-xs text-court-cream/45">{sub}</p>}
    </Card>
  )
}

function CourtScheduleCard({
  court,
  matches,
  booking,
  isTeam,
}: {
  court: Court
  matches: ScheduleItem[]
  booking?: { booked_from: string; booked_until: string; billed_hours: number; court_cost: number }
  isTeam: boolean
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-navy-900 px-4 py-3">
        <div className="flex items-center gap-2 text-cream-50">
          <MapPin className="size-4 text-ember-400" aria-hidden="true" />
          <span className="font-display text-sm ">{court.name}</span>
          <span className="text-[11px] font-medium text-cream-200/50">{formatCurrency(court.hourly_rate)}/hr</span>
        </div>
        {booking && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-semibold text-cream-200/70">
            <span>
              Booked {formatTime(booking.booked_from)} – {formatTime(booking.booked_until)}
            </span>
            <span className="text-cream-200/40">·</span>
            <span>{booking.billed_hours}h billed</span>
            <span className="text-cream-200/40">·</span>
            <span className="text-ember-400">{formatCurrency(booking.court_cost)}</span>
          </div>
        )}
      </div>

      {matches.length === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-court-cream/45">No matches assigned to this court.</p>
      ) : (
        <ul className="divide-y divide-white/10">
          {matches.map((m) => (
            <li key={m.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:py-2.5">
              <div className="flex flex-wrap items-center gap-2 sm:contents">
                <div className="whitespace-nowrap text-xs font-semibold text-court-cream/55 sm:w-[92px] sm:shrink-0 sm:whitespace-normal">
                  {formatTime(m.scheduled_start_time)} – {formatTime(m.scheduled_end_time)}
                </div>
                <Badge variant="outline" className="shrink-0">
                  {isTeam ? `${m.stage} · ${m.game_label}` : stageLabel[m.stage as Match['stage']]} R{m.round_num}
                </Badge>
                <MatchStatusBadge status={m.status} className="ml-auto sm:hidden" />
              </div>
              <div className="min-w-0 flex-1 truncate text-sm text-court-cream/85">
                <span className={cn(m.winner === m.leftId && 'font-bold text-court-cream')}>{m.left}</span>
                <VsBadge />
                <span className={cn(m.winner === m.rightId && 'font-bold text-court-cream')}>{m.right}</span>
              </div>
              <MatchStatusBadge status={m.status} className="hidden sm:inline-flex" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
