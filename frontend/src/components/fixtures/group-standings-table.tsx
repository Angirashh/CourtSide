import { motion } from 'framer-motion'
import { ArrowDown, ArrowRight, ArrowUp, Minus, UserX } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StandingRow } from '@/lib/standings'

export function GroupStandingsTable({ title, rows, qualifySlots = 2 }: { title: string; rows: StandingRow[]; qualifySlots?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/14 bg-ink-card">
      <div className="flex items-center justify-between bg-ink px-4 py-2.5">
        <h4 className="font-display text-xl leading-none text-court-cream">{title.replace(/_/g, ' ')}</h4>
        {qualifySlots > 0 && (
          <span className="flex items-center gap-1 font-sans text-[10px] font-bold uppercase tracking-wide text-ember-500">
            Top {qualifySlots} advance <ArrowRight className="size-3" />
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/14 text-left font-sans text-[11px] uppercase tracking-wide text-court-cream/55">
            <th className="px-4 py-2 font-semibold">#</th>
            <th className="px-2 py-2 font-semibold">Player</th>
            <th className="px-2 py-2 text-center font-semibold">P</th>
            <th className="px-2 py-2 text-center font-semibold">W-L</th>
            <th className="px-2 py-2 text-center font-semibold">Pts</th>
            <th title="Rally point difference" className="hidden px-2 py-2 text-center font-semibold sm:table-cell">Diff</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <motion.tr
              key={row.playerId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: idx * 0.03 }}
              className={cn(
                'border-t border-white/[0.07] transition-colors',
                qualifySlots > 0 && idx < qualifySlots && !row.isWithdrawn && 'bg-ember-500/[0.07]',
                row.isWithdrawn && 'opacity-50'
              )}
            >
              <td
                className={cn(
                  'px-4 py-2.5 font-sans font-bold',
                  qualifySlots > 0 && idx < qualifySlots ? 'text-ember-600' : 'text-court-cream/45'
                )}
              >
                {String(idx + 1).padStart(2, '0')}
              </td>
              <td className="w-full max-w-0 px-2 py-2.5 font-sans text-[13px] font-semibold text-court-cream">
                <span className="flex items-center gap-1.5">
                  <span className="truncate">{row.name}</span>
                  {row.team && (
                    <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-court-cream/45">
                      Team {row.team}
                    </span>
                  )}
                  {row.isWithdrawn && <UserX className="size-3.5 text-danger" />}
                </span>
              </td>
              <td className="px-2 py-2.5 text-center font-sans text-court-cream/55">{row.played}</td>
              <td className="px-2 py-2.5 text-center font-sans text-court-cream/55">
                {row.won}-{row.lost}
              </td>
              <td className="px-2 py-2.5 text-center font-sans font-bold text-court-cream">{row.points}</td>
              <td className="hidden px-2 py-2.5 text-center sm:table-cell">
                <DiffIndicator value={row.pointDiff} />
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DiffIndicator({ value }: { value: number }) {
  if (value > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-success">
        <ArrowUp className="size-3" />
        {value}
      </span>
    )
  if (value < 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-danger">
        <ArrowDown className="size-3" />
        {Math.abs(value)}
      </span>
    )
  return (
    <span className="inline-flex items-center gap-0.5 text-court-cream/45">
      <Minus className="size-3" />
      0
    </span>
  )
}
