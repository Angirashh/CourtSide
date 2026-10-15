import { Medal, Trophy } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { formatMeta } from '@/lib/tournament-format'
import { cn } from '@/lib/utils'
import type { AthleteTournamentHistoryEntry, TournamentFormat } from '@/types/api'

export interface CareerStats {
  tournaments_played: number
  matches_played: number
  matches_won: number
  matches_lost: number
  win_rate_percentage: number
}

export function CareerStatsSection({ stats, history }: { stats: CareerStats; history: AthleteTournamentHistoryEntry[] }) {
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
      <p className="font-display text-2xl tracking-tight text-court-cream sm:text-3xl">{value}</p>
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
        <circle cx="56" cy="56" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="11" />
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
        <span className="font-display text-2xl text-court-cream">{winRate}%</span>
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
      <h2 className="mb-3 font-display text-lg text-court-cream">Tournament history</h2>
      <Card className="divide-y divide-white/10 p-0">
        {history.map((h) => {
          const pct = Math.round((h.points_earned / maxPoints) * 100)
          return (
            <div key={h.tournament_id} className="flex items-center gap-3 p-4">
              <div className="w-24 shrink-0 sm:w-40">
                <p className="line-clamp-2 text-sm font-medium leading-tight text-court-cream">{h.tournament_name}</p>
                <p className="mt-0.5 text-xs text-court-cream/55">{formatHistoryDate(h.tournament_date)}</p>
              </div>
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${h.tournament_name}: ${h.points_earned} points`}
              >
                <div
                  className="h-full w-full origin-left rounded-full bg-ember-500 transition-transform duration-500"
                  style={{ transform: `scaleX(${pct / 100})` }}
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
          )
        })}
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
      <h2 className="mb-3 font-display text-lg text-court-cream">Formats played</h2>
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
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-valuenow={percentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${meta.label}: ${percentage}%`}
              >
                <div
                  className={cn('h-full w-full origin-left rounded-full transition-transform duration-500', meta.barClassName)}
                  style={{ transform: `scaleX(${percentage / 100})` }}
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
