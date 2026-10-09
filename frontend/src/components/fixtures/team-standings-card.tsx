import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { DiffIndicator } from './group-standings-table'
import type { TeamStandingRow } from '@/lib/standings'

// Matches won decides it; a tie there falls back to rally point difference (net points
// scored across every match) rather than leaving it a dead heat, since that's still a
// meaningful signal of which team played the stronger tournament. Still tied on both? Genuinely even.
export function leadingTeam(a: TeamStandingRow, b: TeamStandingRow): 'A' | 'B' | null {
  if (a.matchesWon !== b.matchesWon) return a.matchesWon > b.matchesWon ? 'A' : 'B'
  if (a.pointDiff !== b.pointDiff) return a.pointDiff > b.pointDiff ? 'A' : 'B'
  return null
}

export function TeamStandingsCard({ rows }: { rows: TeamStandingRow[] }) {
  const [a, b] = rows
  const leader = leadingTeam(a, b)

  return (
    <div className="overflow-hidden rounded-2xl border border-white/14 bg-ink-card">
      <div className="bg-ink px-4 py-2.5">
        <h4 className="font-display text-xl leading-none text-court-cream">Team standings</h4>
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-5 sm:gap-8"
      >
        <TeamScoreBlock label="Team A" row={a} highlighted={leader === 'A'} align="right" />
        <div className="text-center">
          <span className="font-display text-3xl font-bold text-court-cream">{a.matchesWon}</span>
          <span className="px-2 text-court-cream/35">–</span>
          <span className="font-display text-3xl font-bold text-court-cream">{b.matchesWon}</span>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-court-cream/45">matches won</p>
        </div>
        <TeamScoreBlock label="Team B" row={b} highlighted={leader === 'B'} align="left" />
      </motion.div>
    </div>
  )
}

function TeamScoreBlock({
  label,
  row,
  highlighted,
  align,
}: {
  label: string
  row: TeamStandingRow
  highlighted: boolean
  align: 'left' | 'right'
}) {
  return (
    <div className={cn('flex flex-col gap-1', align === 'right' ? 'items-end text-right' : 'items-start text-left')}>
      <span className={cn('font-display text-base font-semibold', highlighted ? 'text-ember-500' : 'text-court-cream')}>
        {label}
      </span>
      <span className="text-xs text-court-cream/45">{row.playerCount} players</span>
      <DiffIndicator value={row.pointDiff} />
    </div>
  )
}
