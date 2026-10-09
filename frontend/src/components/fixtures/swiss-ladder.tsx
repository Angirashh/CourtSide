import { Fragment, useMemo, useRef, useState } from 'react'
import { Carousel, type CarouselHandle } from '@/components/ui/carousel'
import { cn, compareByScheduledTime } from '@/lib/utils'
import { FixtureMatchRow } from './fixture-match-row'
import type { Match, Player } from '@/types/api'

export function SwissLadder({
  matches,
  playersById,
  courtsById,
}: {
  matches: Match[]
  playersById: Map<string, Player>
  courtsById: Map<string, string>
}) {
  const rounds = useMemo(() => Array.from(new Set(matches.map((m) => m.round_num))).sort((a, b) => a - b), [matches])
  const roundComplete = useMemo(
    () => rounds.map((round) => matches.filter((m) => m.round_num === round).every((m) => m.is_completed)),
    [rounds, matches]
  )

  // Land on the first round that still has something left to play, so players don't have to
  // swipe past every round they've already seen just to find where things stand right now.
  const defaultIndex = useMemo(() => {
    const idx = roundComplete.findIndex((complete) => !complete)
    return idx === -1 ? Math.max(rounds.length - 1, 0) : idx
  }, [roundComplete, rounds.length])

  const [activeIndex, setActiveIndex] = useState(defaultIndex)
  const carouselRef = useRef<CarouselHandle>(null)

  return (
    <div className="space-y-4">
      <RoundStepper
        rounds={rounds}
        roundComplete={roundComplete}
        activeIndex={activeIndex}
        onSelect={(i) => carouselRef.current?.goTo(i)}
      />
      <Carousel
        ref={carouselRef}
        defaultIndex={defaultIndex}
        slideClassName="basis-full"
        hideDots
        onActiveChange={setActiveIndex}
        renderControls={(controls) => <div className="flex justify-end">{controls}</div>}
      >
        {rounds.map((round) => {
          const roundMatches = matches.filter((m) => m.round_num === round).sort(compareByScheduledTime)
          const priorCount = matches.filter((m) => m.round_num < round).length
          return (
            <div key={round} className="grid gap-2 sm:grid-cols-2">
              {roundMatches.map((match, mIdx) => (
                <FixtureMatchRow
                  key={match.id}
                  match={match}
                  playersById={playersById}
                  courtName={match.court_id ? courtsById.get(match.court_id) : undefined}
                  index={priorCount + mIdx + 1}
                />
              ))}
            </div>
          )
        })}
      </Carousel>
    </div>
  )
}

// Round markers joined by a line, filled ember as each round finishes — a progress trail
// through the rounds rather than the carousel's plain position dots.
function RoundStepper({
  rounds,
  roundComplete,
  activeIndex,
  onSelect,
}: {
  rounds: number[]
  roundComplete: boolean[]
  activeIndex: number
  onSelect: (index: number) => void
}) {
  return (
    <div className="flex items-center py-1">
      {rounds.map((round, i) => (
        <Fragment key={round}>
          <button
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`Go to round ${round}`}
            aria-current={i === activeIndex}
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-colors',
              i === activeIndex
                ? 'border-ember-500 bg-ember-500 text-ink'
                : roundComplete[i]
                  ? 'border-ember-500 bg-ember-500 text-ink'
                  : 'border-white/25 bg-ink text-court-cream/45'
            )}
          >
            {round}
          </button>
          {i < rounds.length - 1 && (
            <div className={cn('h-0.5 flex-1', roundComplete[i] ? 'bg-ember-500' : 'bg-white/15')} />
          )}
        </Fragment>
      ))}
    </div>
  )
}
