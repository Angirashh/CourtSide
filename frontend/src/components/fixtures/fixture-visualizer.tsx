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
    // Grouped by each court's own chronological position (its 1st match, 2nd match, ...)
    // rather than by exact scheduled time. Exact-time grouping reads fine when every court
    // kicks off together, but breaks down the moment they don't: a court that opens later
    // than the others (staggered availability), or one the solver just uses less than the
    // rest, would otherwise land on a start time nothing else shares and spawn its own
    // one-match "round" — inflating the round count with entries that aren't really a new
    // wave of play. Position-based grouping is robust to both cases: that court's Nth match
    // still joins everyone else's Nth match in the same round, whatever the clock says.
    const byCourt = new Map<string, Match[]>()
    for (const m of matches) {
      const key = m.court_id ?? 'unassigned'
      if (!byCourt.has(key)) byCourt.set(key, [])
      byCourt.get(key)!.push(m)
    }
    const courtLists = Array.from(byCourt.values()).map((list) => [...list].sort(compareByScheduledTime))
    const slots: Match[][] = []
    const maxMatchesOnAnyCourt = Math.max(0, ...courtLists.map((list) => list.length))
    for (let position = 0; position < maxMatchesOnAnyCourt; position++) {
      const slotMatches = courtLists
        .map((list) => list[position])
        .filter((m): m is Match => !!m)
        .sort(
          (a, b) =>
            (courtRank.get(a.court_id ?? '') ?? Number.MAX_SAFE_INTEGER) -
            (courtRank.get(b.court_id ?? '') ?? Number.MAX_SAFE_INTEGER)
        )
      if (slotMatches.length > 0) slots.push(slotMatches)
    }
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
          // Only show a single time in the round header when every match in it actually
          // shares one — once a court's staggered opening puts its match at a different
          // clock time than the rest of the round, each match row already shows its own
          // time, so a single header time would just be wrong for part of the round.
          const firstTime = slotMatches[0].scheduled_start_time
          const commonTime = slotMatches.every((m) => m.scheduled_start_time === firstTime) ? firstTime : null
          const isLast = idx === slots.length - 1
          const isActive = idx === activeIdx
          return (
            <div key={idx} ref={isActive ? activeRoundRef : undefined} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full border-2 font-display text-sm font-semibold',
                    isActive ? 'border-navy-900 bg-navy-900 text-cream-50' : 'border-white/20 bg-ink text-court-cream/45'
                  )}
                >
                  {idx + 1}
                </div>
                {!isLast && <div className="w-px flex-1 bg-white/15" />}
              </div>
              <div className="min-w-0 flex-1 pb-6">
                <div className="mb-2 flex items-center justify-between pt-1">
                  <h4 className="font-display text-sm font-semibold text-court-cream">
                    {firstTime ? `Round ${idx + 1}` : 'Unscheduled'}
                  </h4>
                  {commonTime && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-court-cream/45">
                      {formatTime(commonTime)}
                    </span>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {slotMatches.map((m, mIdx) => (
                    <FixtureMatchRow
                      key={m.id}
                      match={m}
                      playersById={playersById}
                      courtName={m.court_id ? courtsById.get(m.court_id) : undefined}
                      index={slots.slice(0, idx).reduce((n, s) => n + s.length, 0) + mIdx + 1}
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
      <TabsList className="grid w-full grid-cols-2 gap-0 bg-white/10 p-1">
        {format === 'GROUP_KNOCKOUT' ? (
          <TabsTrigger
            value="groups"
            className="font-sans text-sm font-semibold text-court-cream/55 shadow-none data-[state=active]:bg-navy-950 data-[state=active]:text-court-cream data-[state=active]:shadow-none"
          >
            <Network className="mr-1.5 size-3.5 inline" />
            Group stage
          </TabsTrigger>
        ) : (
          <TabsTrigger
            value="swiss"
            className="font-sans text-sm font-semibold text-court-cream/55 shadow-none data-[state=active]:bg-navy-950 data-[state=active]:text-court-cream data-[state=active]:shadow-none"
          >
            <Network className="mr-1.5 size-3.5 inline" />
            Swiss rounds
          </TabsTrigger>
        )}
        <TabsTrigger
          value="knockout"
          className="font-sans text-sm font-semibold text-court-cream/55 shadow-none data-[state=active]:bg-navy-950 data-[state=active]:text-court-cream data-[state=active]:shadow-none"
        >
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
  const sortedGroupMatches = [...groupMatches].sort((a, b) => a.round_num - b.round_num || compareByScheduledTime(a, b))
  const matchNumberById = new Map(sortedGroupMatches.map((m, i) => [m.id, i + 1]))

  return (
    <Tabs value={activeGroup} onValueChange={selectGroup}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[.16em] text-ember-500">Round robin</p>
          <h3 className="font-display text-2xl leading-none text-court-cream">{activeGroup.replace(/_/g, ' ')}</h3>
        </div>
        {groupIds.length > 1 && (
          <TabsList className="gap-1.5 bg-transparent p-0">
            {groupIds.map((gid) => (
              <TabsTrigger
                key={gid}
                value={gid}
                className="size-9 bg-white/10 p-0 font-display text-base text-court-cream/55 shadow-none data-[state=active]:bg-navy-950 data-[state=active]:text-court-cream data-[state=active]:shadow-none"
              >
                {gid.split('_').pop()}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
      </div>

      <TabsContent value={activeGroup} className="mt-0 space-y-3.5">
        <div className="flex gap-2">
          {rounds.map((round) => (
            <button
              key={round}
              type="button"
              onClick={() => setActiveRound(round)}
              className={cn(
                'flex-1 rounded-lg px-3 py-2.5 font-display text-lg transition-colors',
                round === activeRound ? 'bg-ember-500 text-ink' : 'bg-white/10 text-court-cream/55 hover:text-court-cream/85'
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
              index={matchNumberById.get(m.id)}
            />
          ))}
        </div>
      </TabsContent>
    </Tabs>
  )
}
