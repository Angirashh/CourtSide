import { useMemo } from 'react'
import { CalendarClock, Clock, MapPin, PiggyBank } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { MatchStatusBadge } from '@/components/ui/status-badge'
import { VsBadge } from '@/components/ui/vs-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn, formatCurrency, formatDate, formatDuration, formatTime, playerLabel } from '@/lib/utils'
import type { Court, Match, Player, TournamentDetail } from '@/types/api'

const stageLabel: Record<Match['stage'], string> = {
  GROUP: 'Group',
  SWISS: 'Swiss',
  KNOCKOUT: 'Knockout',
}

export function ScheduleSummaryTab({ tournament }: { tournament: TournamentDetail }) {
  const playersById = useMemo(() => new Map(tournament.players.map((p) => [p.id, p])), [tournament.players])

  const scheduledMatches = useMemo(
    () => tournament.matches.filter((m) => m.scheduled_start_time && m.scheduled_end_time),
    [tournament.matches]
  )

  const matchesByCourt = useMemo(() => {
    const map = new Map<string, Match[]>()
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

  if (scheduledMatches.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No schedule generated yet"
        description="Generate a schedule to see the tournament's total duration, each court's timetable, and how much the optimiser saves over booking every court all day."
      />
    )
  }

  const overallStart = new Date(Math.min(...scheduledMatches.map((m) => new Date(m.scheduled_start_time!).getTime())))
  const overallEnd = new Date(Math.max(...scheduledMatches.map((m) => new Date(m.scheduled_end_time!).getTime())))
  const durationMinutes = Math.round((overallEnd.getTime() - overallStart.getTime()) / 60000)
  const summary = tournament.schedule_summary
  const savingsPct = summary && summary.flat_booking_cost > 0 ? Math.round((summary.savings / summary.flat_booking_cost) * 100) : 0

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Clock} label="Duration" value={formatDuration(durationMinutes)} sub={formatDate(overallStart.toISOString())} />
        <StatCard icon={CalendarClock} label="Play window" value={`${formatTime(overallStart.toISOString())} – ${formatTime(overallEnd.toISOString())}`} />
      </div>

      {summary && summary.savings > 0 && (
        <Card className="border-ember-300/50 bg-gradient-to-br from-ember-100/60 via-cream-25 to-cream-25 p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ember-500 text-cream-50 shadow-[0_4px_12px_-2px_rgba(232,136,58,0.5)]">
              <PiggyBank className="size-4.5" />
            </div>
            <p className="text-sm leading-relaxed text-navy-700">
              De-ramping each court as its rounds finish costs{' '}
              <span className="font-bold text-navy-900">{formatCurrency(summary.total_estimated_cost)}</span>, versus{' '}
              <span className="text-navy-400 line-through">{formatCurrency(summary.flat_booking_cost)}</span> for renting every
              court for the full {formatDuration(summary.makespan_minutes)} — a saving of{' '}
              <span className="font-bold text-ember-600">
                {formatCurrency(summary.savings)}
                {savingsPct > 0 && ` (${savingsPct}%)`}
              </span>
              .
            </p>
          </div>
        </Card>
      )}

      <Tabs defaultValue={tournament.courts[0]?.id}>
        <TabsList>
          {tournament.courts.map((court) => (
            <TabsTrigger key={court.id} value={court.id} className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" />
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
              booking={summary?.court_bookings[court.name]}
              playersById={playersById}
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
    <Card className={cn('p-3 sm:p-4', accent && 'border-ember-300/60 bg-ember-100/30')}>
      <div className="flex items-center gap-2.5">
        <div className={cn('hidden size-8 shrink-0 items-center justify-center rounded-lg sm:flex', accent ? 'bg-ember-500 text-cream-50' : 'bg-navy-100 text-navy-600')}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className={cn('font-display text-base font-medium leading-tight sm:truncate sm:text-lg sm:leading-none', accent ? 'text-ember-600' : 'text-navy-900')}>{value}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-navy-400">{label}</p>
        </div>
      </div>
      {sub && <p className="mt-2 text-xs text-navy-400">{sub}</p>}
    </Card>
  )
}

function CourtScheduleCard({
  court,
  matches,
  booking,
  playersById,
}: {
  court: Court
  matches: Match[]
  booking?: { booked_from: string; booked_until: string; billed_hours: number; court_cost: number }
  playersById: Map<string, Player>
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-200 bg-navy-900 px-4 py-3">
        <div className="flex items-center gap-2 text-cream-50">
          <MapPin className="size-4 text-ember-400" />
          <span className="font-display text-sm font-medium">{court.name}</span>
          <span className="text-[11px] font-medium text-cream-200/50">₹{court.hourly_rate}/hr</span>
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
        <p className="px-4 py-5 text-center text-sm text-navy-400">No matches assigned to this court.</p>
      ) : (
        <ul className="divide-y divide-cream-200">
          {matches.map((m) => (
            <li key={m.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:py-2.5">
              <div className="flex items-center gap-2 sm:contents">
                <div className="whitespace-nowrap text-xs font-semibold text-navy-500 sm:w-[92px] sm:shrink-0 sm:whitespace-normal">
                  {formatTime(m.scheduled_start_time)} – {formatTime(m.scheduled_end_time)}
                </div>
                <Badge variant="outline" className="shrink-0">
                  {stageLabel[m.stage]} R{m.round_num}
                </Badge>
                <MatchStatusBadge status={m.status} className="ml-auto sm:hidden" />
              </div>
              <div className="min-w-0 flex-1 truncate text-sm text-navy-800">
                <span className={cn(m.winner_id === m.player1_id && 'font-bold text-navy-900')}>{playerLabel(m.player1_id, playersById)}</span>
                <VsBadge />
                <span className={cn(m.winner_id === m.player2_id && 'font-bold text-navy-900')}>{playerLabel(m.player2_id, playersById)}</span>
              </div>
              <MatchStatusBadge status={m.status} className="hidden sm:inline-flex" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
