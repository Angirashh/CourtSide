import { CalendarClock } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { FixtureMatchRow } from '@/components/fixtures/fixture-match-row'
import { compareByScheduledTime } from '@/lib/utils'
import type { Court, Match, Player } from '@/types/api'

/**
 * A logged-in player's own matches in this tournament -- every one of them, not just
 * unfinished ones. Live/upcoming matches lead, soonest first, so the next thing on your
 * schedule is always at the top; completed matches trail underneath, most recent first, as
 * a scrollable record rather than competing with what's still ahead of you.
 */
export function MyMatchesList({
  matches,
  playersById,
  courts,
  myPlayerId,
}: {
  matches: Match[]
  playersById: Map<string, Player>
  courts: Court[]
  myPlayerId: string
}) {
  const courtsById = new Map(courts.map((c) => [c.id, c.name]))
  const myMatches = matches.filter((m) => m.player1_id === myPlayerId || m.player2_id === myPlayerId)

  if (myMatches.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No matches yet"
        description="Your matches will show up here once the schedule is generated."
      />
    )
  }

  const upcoming = myMatches.filter((m) => m.status !== 'COMPLETED').sort(compareByScheduledTime)
  const completed = myMatches.filter((m) => m.status === 'COMPLETED').sort((a, b) => compareByScheduledTime(b, a))
  const orderedMatches = [...upcoming, ...completed]

  // "Up next" means the next *scheduled* match specifically -- a live match already carries
  // its own "On court now" label, so it shouldn't also steal the next scheduled match's badge.
  const nextUpId = upcoming.find((m) => m.status === 'SCHEDULED')?.id

  return (
    <div className="space-y-2.5">
      {orderedMatches.map((match) => (
        <FixtureMatchRow
          key={match.id}
          match={match}
          playersById={playersById}
          courtName={match.court_id ? courtsById.get(match.court_id) : undefined}
          isNextUp={match.id === nextUpId}
          variant="inline"
        />
      ))}
    </div>
  )
}
