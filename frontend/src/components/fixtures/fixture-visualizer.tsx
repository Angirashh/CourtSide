import { useEffect, useMemo, useRef, useState } from 'react'
import { GitBranch, Network } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { BracketTree } from './bracket-tree'
import { SwissLadder } from './swiss-ladder'
import { FixtureMatchRow } from './fixture-match-row'
import { groupMatchesByGroupId } from '@/lib/standings'
import { cn, compareByScheduledTime, formatTime } from '@/lib/utils'
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
  // Ranks by the number in the court's name ("Court 4" -> 4) so matches sort by court
  // number rather than creation order; a custom-named court without a number falls
  // back to its position in the courts list.
  const courtRank = useMemo(() => {
    const rank = new Map<string, number>()
    courts.forEach((c, idx) => {
      const digits = c.name.match(/\d+/)
      rank.set(c.id, digits ? parseInt(digits[0], 10) : idx)
    })
    return rank
  }, [courts])
  const knockoutMatches = matches.filter((m) => m.stage === 'KNOCKOUT')
  const feederMatches = matches.filter((m) => m.stage !== 'KNOCKOUT')
  // Jumps the page to the current round the moment this tab mounts (Tabs unmounts
  // inactive content, so this fires fresh every time someone opens Fixtures) — without
  // it, a player has to scroll past every earlier round to find today's matches.
  const activeRoundRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    activeRoundRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  if (matches.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title="No fixtures yet"
        description="Generate a schedule to see the bracket, groups, or Swiss rounds take shape here."
      />
    )
  }

  if (format === 'TEAM_FRIENDLY') {
    // Grouped by scheduled time rather than a flat list — with every court kicking off
    // its matches together, this naturally reads as "rounds", and lets a player scan
    // straight to the slot they're playing in instead of hunting the whole fixture list.
    const sorted = [...matches].sort(compareByScheduledTime)
    const slotMap = new Map<string, Match[]>()
    for (const m of sorted) {
      const key = m.scheduled_start_time ?? 'unscheduled'
      if (!slotMap.has(key)) slotMap.set(key, [])
      slotMap.get(key)!.push(m)
    }
    const slots = Array.from(slotMap.values()).map((slotMatches) =>
      [...slotMatches].sort(
        (a, b) =>
          (courtRank.get(a.court_id ?? '') ?? Number.MAX_SAFE_INTEGER) -
          (courtRank.get(b.court_id ?? '') ?? Number.MAX_SAFE_INTEGER)
      )
    )
    // The "current" step: the first round with a match still unplayed, or the last
    // round once everything's done — same "where's play at right now" logic the
    // group-stage round picker already uses.
    const activeIdx = (() => {
      const i = slots.findIndex((sm) => sm.some((m) => !m.is_completed))
      return i === -1 ? slots.length - 1 : i
    })()

    return (
      <div>
        {slots.map((slotMatches, idx) => {
          const time = slotMatches[0].scheduled_start_time
          const isLast = idx === slots.length - 1
          const isActive = idx === activeIdx
          return (
            <div key={time ?? 'unscheduled'} ref={isActive ? activeRoundRef : undefined} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full border-2 font-display text-sm font-semibold',
                    isActive ? 'border-navy-900 bg-navy-900 text-cream-50' : 'border-navy-200 bg-cream-50 text-navy-400'
                  )}
                >
                  {idx + 1}
                </div>
                {!isLast && <div className="w-px flex-1 bg-navy-200" />}
              </div>
              <div className="min-w-0 flex-1 pb-6">
                <div className="mb-2 flex items-center justify-between pt-1">
                  <h4 className="font-display text-sm font-semibold text-navy-900">
                    {time ? `Round ${idx + 1}` : 'Unscheduled'}
                  </h4>
                  {time && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-navy-400">
                      {formatTime(time)}
                    </span>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {slotMatches.map((m) => (
                    <FixtureMatchRow
                      key={m.id}
                      match={m}
                      playersById={playersById}
                      courtName={m.court_id ? courtsById.get(m.court_id) : undefined}
                    />
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
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
