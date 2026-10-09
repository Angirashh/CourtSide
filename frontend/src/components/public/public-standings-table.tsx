import { ArrowDown, ArrowRight, ArrowUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PublicStandingRow } from '@/types/api'

export function PublicStandingsTable({
  title,
  rows,
  qualifySlots = 2,
}: {
  title: string
  rows: PublicStandingRow[]
  qualifySlots?: number
}) {
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/14 text-left font-sans text-[11px] uppercase tracking-wide text-court-cream/55">
              <th className="py-2 pl-3 pr-1 font-semibold sm:pl-4">#</th>
              <th className="px-2 py-2 font-semibold">Player</th>
              <th className="px-2 py-2 text-center font-semibold">P</th>
              <th className="px-2 py-2 text-center font-semibold">W-L</th>
              <th className="px-2 py-2 text-center font-semibold">Pts</th>
              <th title="Game difference" className="px-2 py-2 text-center font-semibold">Diff</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.player_id}
                className={cn(
                  'border-t border-white/[0.07]',
                  qualifySlots > 0 && row.rank <= qualifySlots && 'bg-ember-500/[0.07]'
                )}
              >
                <td
                  className={cn(
                    'py-2.5 pl-3 pr-1 font-sans font-bold sm:pl-4',
                    qualifySlots > 0 && row.rank <= qualifySlots ? 'text-ember-600' : 'text-court-cream/45'
                  )}
                >
                  {String(row.rank).padStart(2, '0')}
                </td>
                <td className="w-full px-2 py-2.5 font-sans text-[13px] font-semibold text-court-cream">{row.player_name}</td>
                <td className="px-2 py-2.5 text-center font-sans text-court-cream/55">{row.matches_played}</td>
                <td className="px-2 py-2.5 text-center font-sans text-court-cream/55">
                  {row.matches_won}-{row.matches_lost}
                </td>
                <td className="px-2 py-2.5 text-center font-sans font-bold text-court-cream">{row.match_points}</td>
                <td className="px-2 py-2.5 text-center">
                  <DiffIndicator value={row.games_won - row.games_lost} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    <span className="inline-flex items-center gap-0.5 text-court-cream/45">
      <Minus className="size-3" />
      0
    </span>
  )
}
