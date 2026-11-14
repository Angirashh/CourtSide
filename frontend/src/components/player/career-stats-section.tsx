import { useEffect, useRef, useState } from 'react'
import { Trophy } from 'lucide-react'
// import { Medal } from 'lucide-react' -- only used by the disabled TournamentHistoryChart below
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

      {history.length > 0 && <WinRateTrendChart history={history} />}
      {history.length > 0 && <FormatBreakdownChart history={history} />}
      {/* Disabled until a real points/rating system exists -- points_earned is currently
          always 0 for every player, so this list has nothing real to show yet. */}
      {/* {history.length > 0 && <TournamentHistoryChart history={history} />} */}
    </div>
  )
}

/** Chronological (oldest -> newest) win rate per tournament, skipping any entry with zero
    matches played (a withdrawal/no-show) so it can't masquerade as a 0% result. */
function WinRateTrendChart({ history }: { history: AthleteTournamentHistoryEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [measuredWidth, setMeasuredWidth] = useState(0)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  // Track the card's actual rendered width so chart units map 1:1 to real pixels at any
  // screen size -- a fixed viewBox scaled down to fit a narrow phone is why lines, markers,
  // and text all read as tiny on mobile. This keeps them full-size everywhere instead.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setMeasuredWidth(width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Touch has no hover: a tap opens the tooltip and it stays until the reader taps elsewhere,
  // rather than vanishing the instant their finger lifts.
  useEffect(() => {
    function handleOutsideTap(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setHoverIdx(null)
    }
    document.addEventListener('pointerdown', handleOutsideTap)
    return () => document.removeEventListener('pointerdown', handleOutsideTap)
  }, [])

  const points = [...history].reverse().filter((h) => h.matches_played > 0)
  if (points.length < 2) return null

  const W = Math.max(measuredWidth, 280)
  const H = 320
  const padX = 20
  const padTop = 40
  const padBottom = 12
  const plotW = W - padX * 2
  const plotH = H - padTop - padBottom

  const coords = points.map((p, i) => ({
    x: padX + (plotW * i) / (points.length - 1),
    y: padTop + plotH * (1 - p.win_rate_percentage / 100),
  }))
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')
  const baseline = padTop + plotH
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${baseline} L ${coords[0].x.toFixed(1)} ${baseline} Z`

  const hovered = hoverIdx !== null ? points[hoverIdx] : null
  const hoveredCoord = hoverIdx !== null ? coords[hoverIdx] : null
  const lastPoint = points[points.length - 1]
  const lastCoord = coords[coords.length - 1]

  // A single full-width overlay rather than per-point hit circles -- lets a drag/scrub find
  // the nearest point at any touch position, instead of requiring a precise tap on a tiny dot.
  function handlePointer(e: React.PointerEvent<SVGRectElement>) {
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0) return
    const relX = ((e.clientX - rect.left) / rect.width) * W
    let nearest = 0
    let minDist = Infinity
    for (let i = 0; i < coords.length; i++) {
      const d = Math.abs(coords[i].x - relX)
      if (d < minDist) {
        minDist = d
        nearest = i
      }
    }
    setHoverIdx(nearest)
  }

  return (
    <section>
      <h2 className="mb-3 font-display text-lg text-court-cream">Win rate over time</h2>
      <Card className="relative animate-fade-up p-4 sm:p-5" style={{ animationDelay: '180ms' }}>
        <div ref={containerRef} className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full touch-pan-y"
            style={{ height: H }}
            role="img"
            aria-label={`Win rate across ${points.length} tournaments, from ${Math.round(points[0].win_rate_percentage)}% to ${Math.round(lastPoint.win_rate_percentage)}%`}
          >
            {[0, 25, 50, 75, 100].map((pct) => {
              const y = padTop + plotH * (1 - pct / 100)
              return (
                <g key={pct}>
                  <line x1={padX} x2={W - padX} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                  <text x={0} y={y + 4} fill="rgba(247,243,235,0.4)" fontSize={11}>
                    {pct}%
                  </text>
                </g>
              )
            })}

            <path d={areaPath} fill="var(--color-ember-500)" opacity={0.1} stroke="none" />
            <path d={linePath} fill="none" stroke="var(--color-ember-500)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

            <text x={lastCoord.x} y={lastCoord.y - 12} textAnchor="end" fill="var(--color-court-cream)" fontSize={13} fontWeight={700}>
              {Math.round(lastPoint.win_rate_percentage)}%
            </text>

            {coords.map((c, i) => {
              const won = points[i].final_placement === 1
              const active = hoverIdx === i
              return (
                <g key={points[i].tournament_id}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={active ? 8 : 6}
                    fill="var(--color-ember-500)"
                    stroke="var(--color-ink-card)"
                    strokeWidth={2.5}
                    className="transition-[r] duration-150"
                  />
                  {won && (
                    <Trophy x={c.x - 8} y={c.y - 28} width={16} height={16} className="text-ember-500" aria-hidden="true" />
                  )}
                  {/* Keyboard/screen-reader access only -- the overlay rect below handles pointer/touch. */}
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={10}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={`${points[i].tournament_name}: ${Math.round(points[i].win_rate_percentage)}% win rate, ${points[i].matches_won} of ${points[i].matches_played} matches won${won ? ' — champion' : ''}`}
                    onFocus={() => setHoverIdx(i)}
                    onBlur={() => setHoverIdx(null)}
                    className="outline-none"
                  />
                </g>
              )
            })}

            <rect
              x={0}
              y={0}
              width={W}
              height={H}
              fill="transparent"
              className="cursor-pointer"
              onPointerDown={handlePointer}
              onPointerMove={(e) => {
                if (e.pointerType !== 'touch' || e.buttons > 0 || e.pressure > 0) handlePointer(e)
              }}
              onPointerLeave={(e) => {
                if (e.pointerType !== 'touch') setHoverIdx(null)
              }}
            />
          </svg>

          {hovered && hoveredCoord && (
            <div
              className="pointer-events-none absolute z-10 w-max max-w-[180px] -translate-x-1/2 -translate-y-full rounded-lg border border-white/10 bg-ink px-2.5 py-1.5 text-xs shadow-lg"
              style={{
                // Clamped in real pixels (not a plain percentage of the point's X) so the
                // tooltip's own half-width stays inside the chart even for the first/last
                // point, instead of sliding off the edge of the screen.
                left: `${(Math.min(Math.max(hoveredCoord.x, 92), W - 92) / W) * 100}%`,
                top: `${(hoveredCoord.y / H) * 100}%`,
              }}
            >
              <p className="flex items-center gap-1 font-semibold text-court-cream">
                {Math.round(hovered.win_rate_percentage)}%
                {hovered.final_placement === 1 && <Trophy className="size-3 text-ember-500" aria-hidden="true" />}
              </p>
              <p className="truncate text-court-cream/55">{hovered.tournament_name}</p>
              <p className="text-court-cream/40">{hovered.matches_won}/{hovered.matches_played} won</p>
            </div>
          )}
        </div>
      </Card>
    </section>
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

// Disabled until a real points/rating system exists -- points_earned is currently always 0
// for every player, so this list has nothing real to show yet. Re-enable (and restore the
// TournamentHistoryChart/HistoryRow render call above, plus the Medal import) once it does.
// function formatHistoryDate(iso: string): string {
//   const date = new Date(iso)
//   if (Number.isNaN(date.getTime())) return '—'
//   return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
// }
//
// function TournamentHistoryChart({ history }: { history: AthleteTournamentHistoryEntry[] }) {
//   const maxPoints = Math.max(...history.map((h) => h.points_earned), 1)
//
//   return (
//     <section>
//       <h2 className="mb-3 font-display text-lg text-court-cream">Tournament history</h2>
//       <Card className="animate-fade-up divide-y divide-white/10 p-0" style={{ animationDelay: '120ms' }}>
//         {history.map((h, i) => (
//           <HistoryRow key={h.tournament_id} entry={h} maxPoints={maxPoints} delayMs={i * 60} />
//         ))}
//       </Card>
//     </section>
//   )
// }
//
// function HistoryRow({
//   entry,
//   maxPoints,
//   delayMs,
// }: {
//   entry: AthleteTournamentHistoryEntry
//   maxPoints: number
//   delayMs: number
// }) {
//   const pct = Math.round((entry.points_earned / maxPoints) * 100)
//   const animatedPct = useAnimatedValue(pct, delayMs)
//
//   return (
//     <div className="flex items-center gap-3 p-4">
//       <div className="w-24 shrink-0 sm:w-40">
//         <p className="line-clamp-2 text-sm font-medium leading-tight text-court-cream">{entry.tournament_name}</p>
//         <p className="mt-0.5 text-xs text-court-cream/55">{formatHistoryDate(entry.tournament_date)}</p>
//       </div>
//       <div
//         className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"
//         role="progressbar"
//         aria-valuenow={pct}
//         aria-valuemin={0}
//         aria-valuemax={100}
//         aria-label={`${entry.tournament_name}: ${entry.points_earned} points`}
//       >
//         <div
//           className="h-full w-full origin-left rounded-full bg-ember-500 transition-transform duration-500 ease-out motion-reduce:transition-none"
//           style={{ transform: `scaleX(${animatedPct / 100})` }}
//         />
//       </div>
//       <div className="flex w-16 shrink-0 items-center justify-end gap-1.5 text-xs font-semibold text-court-cream/70">
//         {entry.final_placement === 1 && <Trophy className="size-3.5 text-ember-500" aria-hidden="true" />}
//         {entry.final_placement !== null && entry.final_placement > 1 && entry.final_placement <= 3 && (
//           <Medal className="size-3.5 text-court-cream/45" aria-hidden="true" />
//         )}
//         {entry.points_earned} pts
//       </div>
//     </div>
//   )
// }

/** One bar, segments proportional to how often each format was played -- replaces the old
    one-row-per-format list so every format is compared at a glance instead of read top to bottom. */
function FormatBreakdownChart({ history }: { history: AthleteTournamentHistoryEntry[] }) {
  const [hoverFormat, setHoverFormat] = useState<TournamentFormat | null>(null)
  const total = history.length
  const counts = history.reduce<Partial<Record<TournamentFormat, number>>>((acc, h) => {
    acc[h.format] = (acc[h.format] ?? 0) + 1
    return acc
  }, {})
  const formats = (Object.keys(counts) as TournamentFormat[]).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))

  return (
    <section>
      <h2 className="mb-3 font-display text-lg text-court-cream">Formats played</h2>
      <Card className="animate-fade-up p-4 sm:p-5" style={{ animationDelay: '60ms' }}>
        <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full" role="group" aria-label="Formats played, by share of tournaments">
          {formats.map((format) => {
            const meta = formatMeta[format]
            const count = counts[format] ?? 0
            const pct = (count / total) * 100
            return (
              <button
                key={format}
                type="button"
                className={cn(
                  'h-full border-0 p-0 transition-opacity duration-200',
                  meta.barClassName,
                  hoverFormat && hoverFormat !== format && 'opacity-40'
                )}
                style={{ width: `${pct}%` }}
                onMouseEnter={() => setHoverFormat(format)}
                onMouseLeave={() => setHoverFormat(null)}
                onFocus={() => setHoverFormat(format)}
                onBlur={() => setHoverFormat(null)}
                aria-label={`${meta.label}: ${count} tournament${count === 1 ? '' : 's'}, ${Math.round(pct)}%`}
              />
            )
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {formats.map((format) => {
            const meta = formatMeta[format]
            const Icon = meta.icon
            const count = counts[format] ?? 0
            const pct = Math.round((count / total) * 100)
            return (
              <div
                key={format}
                className={cn('flex items-center gap-1.5 text-xs transition-opacity duration-200', hoverFormat && hoverFormat !== format && 'opacity-40')}
              >
                <span className={cn('size-2.5 shrink-0 rounded-full', meta.barClassName)} aria-hidden="true" />
                <Icon className="size-3.5 shrink-0 text-court-cream/55" aria-hidden="true" />
                <span className="font-medium text-court-cream">{meta.label}</span>
                <span className="tabular-nums text-court-cream/45">
                  {pct}% ({count})
                </span>
              </div>
            )
          })}
        </div>
      </Card>
    </section>
  )
}
