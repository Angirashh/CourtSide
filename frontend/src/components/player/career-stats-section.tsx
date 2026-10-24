import { useEffect, useState } from 'react'
import { Medal, Trophy } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'
import { formatMeta } from '@/lib/tournament-format'
import { cn } from '@/lib/utils'
import type { AthleteTournamentHistoryEntry, TournamentFormat } from '@/types/api'

/** Animates a value from 0 up to `target` shortly after mount (two rAFs so the browser commits
    the 0-state frame first and the subsequent change is a real transition, not a no-op). Used to
    make the charts below draw themselves in rather than appearing already-filled. Snaps straight
    to `target` under `prefers-reduced-motion`. */
function useAnimatedValue(target: number, delayMs = 0): number {
  const prefersReducedMotion = usePrefersReducedMotion()
  const [value, setValue] = useState(prefersReducedMotion ? target : 0)

  useEffect(() => {
    if (prefersReducedMotion) {
      setValue(target)
      return
    }
    setValue(0)
    let raf1 = 0
    let raf2 = 0
    const timer = setTimeout(() => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setValue(target))
      })
    }, delayMs)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [target, delayMs, prefersReducedMotion])

  return value
}

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
      <Card className="flex animate-fade-up flex-col items-center gap-6 p-5 sm:flex-row sm:justify-between">
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
  const clampedWinRate = Math.min(Math.max(winRate, 0), 100)
  const animatedWinRate = useAnimatedValue(clampedWinRate)
  const offset = circumference - (circumference * animatedWinRate) / 100

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
          className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-2xl tabular-nums text-court-cream">{Math.round(animatedWinRate)}%</span>
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
      <Card className="animate-fade-up divide-y divide-white/10 p-0" style={{ animationDelay: '120ms' }}>
        {history.map((h, i) => (
          <HistoryRow key={h.tournament_id} entry={h} maxPoints={maxPoints} delayMs={i * 60} />
        ))}
      </Card>
    </section>
  )
}

function HistoryRow({
  entry,
  maxPoints,
  delayMs,
}: {
  entry: AthleteTournamentHistoryEntry
  maxPoints: number
  delayMs: number
}) {
  const pct = Math.round((entry.points_earned / maxPoints) * 100)
  const animatedPct = useAnimatedValue(pct, delayMs)

  return (
    <div className="flex items-center gap-3 p-4">
      <div className="w-24 shrink-0 sm:w-40">
        <p className="line-clamp-2 text-sm font-medium leading-tight text-court-cream">{entry.tournament_name}</p>
        <p className="mt-0.5 text-xs text-court-cream/55">{formatHistoryDate(entry.tournament_date)}</p>
      </div>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${entry.tournament_name}: ${entry.points_earned} points`}
      >
        <div
          className="h-full w-full origin-left rounded-full bg-ember-500 transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${animatedPct / 100})` }}
        />
      </div>
      <div className="flex w-16 shrink-0 items-center justify-end gap-1.5 text-xs font-semibold text-court-cream/70">
        {entry.final_placement === 1 && <Trophy className="size-3.5 text-ember-500" aria-hidden="true" />}
        {entry.final_placement !== null && entry.final_placement > 1 && entry.final_placement <= 3 && (
          <Medal className="size-3.5 text-court-cream/45" aria-hidden="true" />
        )}
        {entry.points_earned} pts
      </div>
    </div>
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
      <Card className="animate-fade-up divide-y divide-white/10 p-0" style={{ animationDelay: '60ms' }}>
        {formats.map((format, i) => (
          <FormatRow key={format} format={format} count={counts[format] ?? 0} total={total} delayMs={i * 60} />
        ))}
      </Card>
    </section>
  )
}

function FormatRow({
  format,
  count,
  total,
  delayMs,
}: {
  format: TournamentFormat
  count: number
  total: number
  delayMs: number
}) {
  const meta = formatMeta[format]
  const Icon = meta.icon
  const percentage = Math.round((count / total) * 100)
  const animatedPercentage = useAnimatedValue(percentage, delayMs)

  return (
    <div className="flex items-center gap-3 p-4">
      <div className="flex w-28 shrink-0 items-center gap-2 sm:w-44">
        <Icon className="size-4 shrink-0 text-court-cream/55" aria-hidden="true" />
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
          className={cn(
            'h-full w-full origin-left rounded-full transition-transform duration-500 ease-out motion-reduce:transition-none',
            meta.barClassName
          )}
          style={{ transform: `scaleX(${animatedPercentage / 100})` }}
        />
      </div>
      <div className="w-20 shrink-0 text-right text-xs font-semibold tabular-nums text-court-cream/70">
        {percentage}% <span className="text-court-cream/45">({count})</span>
      </div>
    </div>
  )
}
