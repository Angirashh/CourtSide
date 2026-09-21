import { CalendarClock, CircleDot, Clock, IndianRupee, MapPin, PiggyBank, Swords, Timer, Users, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn, formatCurrency, formatDuration } from '@/lib/utils'
import type { TournamentDetail } from '@/types/api'

export function StatsTab({ tournament }: { tournament: TournamentDetail }) {
  const realPlayers = tournament.players.filter((p) => !p.is_placeholder)
  const completedMatches = tournament.matches.filter((m) => m.is_completed)

  const summary = tournament.schedule_summary
  // Shuttles wear out by matches played, not by time — count every real (non-bye,
  // non-walkover) match the draw will actually need, whether it's been played yet or not.
  const playableMatches = tournament.matches.filter((m) => !m.is_bye && !m.is_walkover).length
  const shuttlesNeeded = Math.ceil(playableMatches / tournament.shuttle_matches_per_unit)
  const totalShuttleCost = shuttlesNeeded * tournament.shuttle_cost
  const totalCourtCost = summary?.total_estimated_cost ?? 0
  const costPerPlayer = realPlayers.length > 0 ? (totalCourtCost + totalShuttleCost) / realPlayers.length : 0
  const savingsPct = summary && summary.flat_booking_cost > 0 ? Math.round((summary.savings / summary.flat_booking_cost) * 100) : 0

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
        <StatTile icon={Users} label="Players" value={realPlayers.length} />
        <StatTile icon={MapPin} label="Courts" value={tournament.courts.length} />
        <StatTile icon={Swords} label="Matches" value={tournament.matches.length} />
        <StatTile icon={CalendarClock} label="Completed" value={completedMatches.length} />
        <StatTile icon={Clock} label="Avg. match time" value={`${tournament.match_duration_minutes}m`} />
        <StatTile icon={Timer} label="Rest between matches" value={`${tournament.rest_time_minutes}m`} />
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <StatTile icon={IndianRupee} label="Total court cost" value={formatCurrency(totalCourtCost)} />
          <StatTile
            icon={CircleDot}
            label="Shuttle cost"
            value={formatCurrency(totalShuttleCost)}
            sub={`${shuttlesNeeded} shuttle${shuttlesNeeded === 1 ? '' : 's'} · ${playableMatches} matches`}
          />
          <StatTile
            icon={Wallet}
            label="Cost per player"
            value={realPlayers.length > 0 ? formatCurrency(costPerPlayer) : '—'}
            sub="Court + shuttle cost"
          />
          <StatTile
            icon={PiggyBank}
            label="You saved"
            value={summary.savings > 0 ? formatCurrency(summary.savings) : '—'}
            accent={summary.savings > 0}
          />
        </div>
      )}

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
    </div>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: LucideIcon
  label: string
  value: number | string
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
          <p className={cn('truncate font-display text-xl font-medium leading-none', accent ? 'text-ember-600' : 'text-navy-900')}>{value}</p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-navy-400">{label}</p>
        </div>
      </div>
      {sub && <p className="mt-1.5 text-xs text-navy-400 sm:mt-2">{sub}</p>}
    </Card>
  )
}
