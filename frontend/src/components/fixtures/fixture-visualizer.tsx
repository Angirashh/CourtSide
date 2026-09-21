import { useMemo } from 'react'
import { GitBranch, Network } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { BracketTree } from './bracket-tree'
import { SwissLadder } from './swiss-ladder'
import { FixtureMatchRow } from './fixture-match-row'
import { groupMatchesByGroupId } from '@/lib/standings'
import type { Match, Player, TournamentFormat } from '@/types/api'

export function FixtureVisualizer({
  format,
  matches,
  players,
}: {
  format: TournamentFormat
  matches: Match[]
  players: Player[]
}) {
  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const knockoutMatches = matches.filter((m) => m.stage === 'KNOCKOUT')
  const feederMatches = matches.filter((m) => m.stage !== 'KNOCKOUT')

  if (matches.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title="No fixtures yet"
        description="Generate a schedule to see the bracket, groups, or Swiss rounds take shape here."
      />
    )
  }

  return (
    <Tabs defaultValue={format === 'GROUP_KNOCKOUT' ? 'groups' : 'swiss'} className="space-y-5">
      <TabsList>
        {format === 'GROUP_KNOCKOUT' ? (
          <TabsTrigger value="groups">
            <Network className="mr-1.5 size-3.5 inline" />
            Group stage
          </TabsTrigger>
        ) : (
          <TabsTrigger value="swiss">
            <Network className="mr-1.5 size-3.5 inline" />
            Swiss rounds
          </TabsTrigger>
        )}
        <TabsTrigger value="knockout">
          <GitBranch className="mr-1.5 size-3.5 inline" />
          Knockout
        </TabsTrigger>
      </TabsList>

      {format === 'GROUP_KNOCKOUT' ? (
        <TabsContent value="groups">
          <GroupStageView matches={feederMatches} playersById={playersById} />
        </TabsContent>
      ) : (
        <TabsContent value="swiss">
          <SwissLadder matches={feederMatches} playersById={playersById} />
        </TabsContent>
      )}

      <TabsContent value="knockout">
        {knockoutMatches.length === 0 ? (
          <EmptyState
            icon={GitBranch}
            title="Knockout stage not open yet"
            description={format === 'GROUP_KNOCKOUT' ? 'Finish the group stage to see qualifiers advance here.' : 'Finish the Swiss rounds to see the semifinal bracket here.'}
          />
        ) : (
          <BracketTree matches={knockoutMatches} playersById={playersById} />
        )}
      </TabsContent>
    </Tabs>
  )
}

function GroupStageView({ matches, playersById }: { matches: Match[]; playersById: Map<string, Player> }) {
  const groups = groupMatchesByGroupId(matches)
  const groupIds = Array.from(groups.keys()).sort()

  if (groupIds.length === 0) {
    return <EmptyState icon={Network} title="No group matches yet" />
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {groupIds.map((gid) => {
        const groupMatches = groups.get(gid)!
        const rounds = Array.from(new Set(groupMatches.map((m) => m.round_num))).sort((a, b) => a - b)
        return (
          <div key={gid} className="min-w-0 space-y-3">
            <h3 className="font-display text-base font-medium text-navy-900">{gid.replace(/_/g, ' ')}</h3>
            {rounds.map((round) => (
              <div key={round}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-navy-500">Round {round}</p>
                <div className="space-y-2">
                  {groupMatches
                    .filter((m) => m.round_num === round)
                    .sort((a, b) => a.id.localeCompare(b.id))
                    .map((m) => (
                      <FixtureMatchRow key={m.id} match={m} playersById={playersById} />
                    ))}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
