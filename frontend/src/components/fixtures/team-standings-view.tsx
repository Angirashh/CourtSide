import { Trophy } from 'lucide-react'
import { usePublicTeamStandings } from '@/hooks/use-public'
import { EmptyState } from '@/components/ui/empty-state'
import type { TournamentFormat } from '@/types/api'

export function TeamStandingsView({ tournamentId, format }: { tournamentId: string; format: TournamentFormat }) {
  const { data, isLoading } = usePublicTeamStandings(tournamentId)
  const groups = Object.entries(data ?? {})
  if (format === 'KNOCKOUT' || (!isLoading && groups.length === 0)) {
    return <EmptyState icon={Trophy} title="No standings table" description="Knockout tournaments are decided by the bracket." />
  }
  if (isLoading) return <p className="py-8 text-center text-sm text-court-cream/45">Loading standings…</p>
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {groups.map(([group, rows]) => (
        <div key={group} className="overflow-hidden rounded-2xl border border-white/14 bg-ink-card">
          <div className="bg-ink px-4 py-2.5">
            <h4 className="font-display text-xl leading-none text-court-cream">{group === 'SWISS' ? 'Swiss standings' : group.replaceAll('_', ' ')}</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-white/14 text-left font-sans text-[11px] uppercase tracking-wide text-court-cream/55">
                  {['#', 'Team', 'Ties', 'W', 'D', 'L', 'Game diff', 'Point diff', 'Points'].map((label) => <th key={label} className="px-3 py-2 font-semibold">{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.team_id} className="border-t border-white/[0.07] text-court-cream/70">
                    <td className="px-3 py-2.5 font-bold text-court-cream">{String(row.rank).padStart(2, '0')}</td>
                    <td className="max-w-0 px-3 py-2.5 font-sans text-[13px] font-semibold text-court-cream"><span className="block truncate">{row.team_name}</span></td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{row.matches_played}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{row.matches_won}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{row.matches_drawn}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{row.matches_lost}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{row.games_won - row.games_lost}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{row.points_won - row.points_lost}</td>
                    <td className="px-3 py-2.5 text-center font-bold tabular-nums text-court-cream">{row.match_points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
