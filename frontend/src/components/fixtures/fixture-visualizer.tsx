import { useMemo, useState } from 'react'
import { GitBranch, Network } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { BracketTree } from './bracket-tree'
import { SwissLadder } from './swiss-ladder'
import { FixtureMatchRow } from './fixture-match-row'
import { groupMatchesByGroupId } from '@/lib/standings'
import { cn, compareByScheduledTime } from '@/lib/utils'
import type { Court, Match, Player, TournamentFormat } from '@/types/api'

export function FixtureVisualizer({
  format,
  matches,
  players,
  courts = [],
}: {
  format: TournamentFormat
  matches: Match[]
  players: Player[]
  courts?: Court[]
}) {
  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const courtsById = useMemo(() => new Map(courts.map((c) => [c.id, c.name])), [courts])
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
          <GroupStageView matches={feederMatches} playersById={playersById} courtsById={courtsById} />
        </TabsContent>
      ) : (
        <TabsContent value="swiss">
          <SwissLadder matches={feederMatches} playersById={playersById} courtsById={courtsById} />
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
          <BracketTree matches={knockoutMatches} playersById={playersById} courtsById={courtsById} />
        )}
      </TabsContent>
    </Tabs>
  )
}

// The round a group should open on: the first one that isn't fully played yet, or its last
// round if the group is done — so picking a group doesn't dump you back at round 1 every time.
function currentRoundOf(groupMatches: Match[]): number {
  const rounds = Array.from(new Set(groupMatches.map((m) => m.round_num))).sort((a, b) => a - b)
  const idx = rounds.findIndex((r) => groupMatches.some((m) => m.round_num === r && !m.is_completed))
  return idx === -1 ? rounds[rounds.length - 1] : rounds[idx]
}

function GroupStageView({
  matches,
  playersById,
  courtsById,
}: {
  matches: Match[]
  playersById: Map<string, Player>
  courtsById: Map<string, string>
}) {
  const groups = useMemo(() => groupMatchesByGroupId(matches), [matches])
  const groupIds = useMemo(() => Array.from(groups.keys()).sort(), [groups])
  const [activeGroup, setActiveGroup] = useState(groupIds[0])
  const [activeRound, setActiveRound] = useState(() => currentRoundOf(groups.get(groupIds[0]) ?? []))

  if (groupIds.length === 0) {
    return <EmptyState icon={Network} title="No group matches yet" />
  }

  function selectGroup(gid: string) {
    setActiveGroup(gid)
    setActiveRound(currentRoundOf(groups.get(gid) ?? []))
  }

  const groupMatches = groups.get(activeGroup) ?? groups.get(groupIds[0])!
  const rounds = Array.from(new Set(groupMatches.map((m) => m.round_num))).sort((a, b) => a - b)
  const roundMatches = groupMatches.filter((m) => m.round_num === activeRound).sort(compareByScheduledTime)

  return (
    <Tabs value={activeGroup} onValueChange={selectGroup}>
      <TabsList>
        {groupIds.map((gid) => (
          <TabsTrigger key={gid} value={gid}>
            {gid.replace(/_/g, ' ')}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value={activeGroup} className="space-y-3.5">
        <div className="flex flex-wrap gap-1.5">
          {rounds.map((round) => (
            <button
              key={round}
              type="button"
              onClick={() => setActiveRound(round)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors',
                round === activeRound ? 'bg-ember-500 text-navy-950' : 'bg-navy-100/70 text-navy-500 hover:text-navy-800'
              )}
            >
              Round {round}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {roundMatches.map((m) => (
            <FixtureMatchRow
              key={m.id}
              match={m}
              playersById={playersById}
              courtName={m.court_id ? courtsById.get(m.court_id) : undefined}
            />
          ))}
        </div>
      </TabsContent>
    </Tabs>
  )
}
