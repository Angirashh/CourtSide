import { motion } from 'framer-motion'
import { ArrowDown, ArrowUp, Minus, UserX } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StandingRow } from '@/lib/standings'

export function GroupStandingsTable({ title, rows, qualifySlots = 2 }: { title: string; rows: StandingRow[]; qualifySlots?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-cream-200 bg-cream-25">
      <div className="flex items-center justify-between border-b border-cream-200 bg-navy-900 px-4 py-2.5">
        <h4 className="font-display text-sm font-medium text-cream-50">{title}</h4>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-cream-200/50">
          Top {qualifySlots} advance
        </span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-navy-400">
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
                'border-t border-cream-200 transition-colors',
                idx < qualifySlots && !row.isWithdrawn && 'bg-ember-100/40',
                row.isWithdrawn && 'opacity-50'
              )}
            >
              <td className="px-4 py-2.5 font-bold text-navy-400">{idx + 1}</td>
              <td className="px-2 py-2.5 font-semibold text-navy-900">
                <span className="flex items-center gap-1.5">
                  {row.name}
                  {row.isWithdrawn && <UserX className="size-3.5 text-danger" />}
                </span>
              </td>
              <td className="px-2 py-2.5 text-center text-navy-600">{row.played}</td>
              <td className="px-2 py-2.5 text-center text-navy-600">
                {row.won}-{row.lost}
              </td>
              <td className="px-2 py-2.5 text-center font-bold text-navy-900">{row.points}</td>
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

function DiffIndicator({ value }: { value: number }) {
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
    <span className="inline-flex items-center gap-0.5 text-navy-400">
      <Minus className="size-3" />
      0
    </span>
  )
}
