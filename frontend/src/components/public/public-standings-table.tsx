import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PublicStandingRow } from '@/types/api'

export function PublicStandingsTable({ title, rows }: { title: string; rows: PublicStandingRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-cream-200 bg-cream-25">
      <div className="flex items-center justify-between border-b border-cream-200 bg-navy-900 px-4 py-2.5">
        <h4 className="font-display text-sm font-medium text-cream-50">{title}</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-navy-400">
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
              <tr key={row.player_id} className={cn('border-t border-cream-200', row.rank <= 2 && 'bg-ember-100/40')}>
                <td className="py-2.5 pl-3 pr-1 font-bold text-navy-400 sm:pl-4">{row.rank}</td>
                <td className="w-full px-2 py-2.5 font-semibold text-navy-900">{row.player_name}</td>
                <td className="px-2 py-2.5 text-center text-navy-600">{row.matches_played}</td>
                <td className="px-2 py-2.5 text-center text-navy-600">
                  {row.matches_won}-{row.matches_lost}
                </td>
                <td className="px-2 py-2.5 text-center font-bold text-navy-900">{row.match_points}</td>
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
    <span className="inline-flex items-center gap-0.5 text-navy-400">
      <Minus className="size-3" />
      0
    </span>
  )
}
