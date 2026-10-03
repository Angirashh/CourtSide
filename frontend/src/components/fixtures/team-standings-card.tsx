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
    <div className="overflow-hidden rounded-xl border border-cream-200 bg-cream-25">
      <div className="border-b border-cream-200 bg-navy-900 px-4 py-2.5">
        <h4 className="font-display text-sm font-medium text-cream-50">Team standings</h4>
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-5 sm:gap-8"
      >
        <TeamScoreBlock label="Team A" row={a} highlighted={leader === 'A'} align="right" />
        <div className="text-center">
          <span className="font-display text-3xl font-bold text-navy-900">{a.matchesWon}</span>
          <span className="px-2 text-navy-300">–</span>
          <span className="font-display text-3xl font-bold text-navy-900">{b.matchesWon}</span>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-navy-400">matches won</p>
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
      <span className={cn('font-display text-base font-semibold', highlighted ? 'text-ember-500' : 'text-navy-900')}>
        {label}
      </span>
      <span className="text-xs text-navy-400">{row.playerCount} players</span>
      <DiffIndicator value={row.pointDiff} />
    </div>
  )
}
