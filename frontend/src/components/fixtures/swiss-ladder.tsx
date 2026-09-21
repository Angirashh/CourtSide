import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { FixtureMatchRow } from './fixture-match-row'
import type { Match, Player } from '@/types/api'

export function SwissLadder({
  matches,
  playersById,
}: {
  matches: Match[]
  playersById: Map<string, Player>
}) {
  const rounds = Array.from(new Set(matches.map((m) => m.round_num))).sort((a, b) => a - b)

  return (
    <div className="relative space-y-6 pl-6">
      <div className="absolute left-[9px] top-2 bottom-2 w-px bg-cream-300" aria-hidden />
      {rounds.map((round, idx) => {
        const roundMatches = matches.filter((m) => m.round_num === round).sort((a, b) => a.id.localeCompare(b.id))
        const complete = roundMatches.every((m) => m.is_completed)
        return (
          <motion.div
            key={round}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.06 }}
            className="relative"
          >
            <div
              className={cn(
                'absolute -left-6 top-0.5 flex size-[19px] items-center justify-center rounded-full border-2 text-[10px] font-bold',
                complete ? 'border-ember-500 bg-ember-500 text-navy-950' : 'border-navy-300 bg-cream-50 text-navy-400'
              )}
            >
              {round}
            </div>
            <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-navy-500">Round {round}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {roundMatches.map((match) => (
                <FixtureMatchRow key={match.id} match={match} playersById={playersById} />
              ))}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
