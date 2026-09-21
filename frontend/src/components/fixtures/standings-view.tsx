import { useMemo } from 'react'
import { Trophy } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { GroupStandingsTable } from './group-standings-table'
import { computeStandings, groupMatchesByGroupId, playersInMatches } from '@/lib/standings'
import type { Match, Player, TournamentFormat } from '@/types/api'

export function StandingsView({ format, matches, players }: { format: TournamentFormat; matches: Match[]; players: Player[] }) {
  const feederMatches = useMemo(() => matches.filter((m) => m.stage !== 'KNOCKOUT'), [matches])

  if (feederMatches.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="No standings yet"
        description="Generate a schedule and standings will track here as results come in."
      />
    )
  }

  if (format !== 'GROUP_KNOCKOUT') {
    const rows = computeStandings(players.filter((p) => !p.is_placeholder), feederMatches)
    return <GroupStandingsTable title="Swiss standings" rows={rows} qualifySlots={4} />
  }

  const groups = groupMatchesByGroupId(feederMatches)
  const groupIds = Array.from(groups.keys()).sort()
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {groupIds.map((gid) => {
        const groupMatches = groups.get(gid)!
        const rows = computeStandings(playersInMatches(groupMatches, players), groupMatches)
        return (
          <div key={gid} className="min-w-0">
            <GroupStandingsTable title={gid.replace(/_/g, ' ')} rows={rows} />
          </div>
        )
      })}
    </div>
  )
}
