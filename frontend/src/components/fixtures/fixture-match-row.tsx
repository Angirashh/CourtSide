import { Check, UserX } from 'lucide-react'
import { VsBadge } from '@/components/ui/vs-badge'
import { cn, formatTime, playerLabel } from '@/lib/utils'
import type { Match, Player } from '@/types/api'

export function FixtureMatchRow({ match, playersById }: { match: Match; playersById: Map<string, Player> }) {
  const p1 = match.player1_id ? playersById.get(match.player1_id) : undefined
  const p2 = match.player2_id ? playersById.get(match.player2_id) : undefined
  const hasWinner = match.is_completed && !!match.winner_id
  const hasScores = !!match.scores?.length

  return (
    <div
      className={cn(
        'rounded-lg border bg-cream-25 px-3 py-2.5',
        hasWinner ? 'border-ember-300/60' : 'border-cream-200'
      )}
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <Name
          label={playerLabel(match.player1_id, playersById)}
          isWinner={hasWinner && match.winner_id === match.player1_id}
          isWithdrawn={!!p1?.is_withdrawn}
          isPlaceholder={!!p1?.is_placeholder}
        />
        <VsBadge className="mx-0" />
        <Name
          label={match.is_bye ? 'Bye' : playerLabel(match.player2_id, playersById)}
          isWinner={hasWinner && !!match.player2_id && match.winner_id === match.player2_id}
          isWithdrawn={!!p2?.is_withdrawn}
          isPlaceholder={!!p2?.is_placeholder || match.is_bye}
          align="right"
        />
      </div>

      {(hasScores || match.is_walkover || (!match.is_completed && match.scheduled_start_time)) && (
        <div className="mt-1.5 flex items-center justify-center gap-1.5">
          {hasScores &&
            match.scores!.map((game, i) => (
              <span
                key={i}
                className="rounded-md bg-navy-100 px-1.5 py-0.5 text-[11px] tabular-nums text-navy-500"
              >
                <span className={cn(game.p1 > game.p2 && 'font-bold text-navy-900')}>{game.p1}</span>
                <span className="mx-0.5 text-navy-300">–</span>
                <span className={cn(game.p2 > game.p1 && 'font-bold text-navy-900')}>{game.p2}</span>
              </span>
            ))}
          {match.is_walkover && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Walkover</span>
          )}
          {!match.is_completed && match.scheduled_start_time && (
            <span className="text-[11px] font-medium text-navy-400">{formatTime(match.scheduled_start_time)}</span>
          )}
        </div>
      )}
    </div>
  )
}

function Name({
  label,
  isWinner,
  isWithdrawn,
  isPlaceholder,
  align = 'left',
}: {
  label: string
  isWinner: boolean
  isWithdrawn: boolean
  isPlaceholder: boolean
  align?: 'left' | 'right'
}) {
  return (
    <span className={cn('flex min-w-0 flex-1', align === 'right' && 'justify-end')}>
      <span
        className={cn(
          'inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5',
          isWinner ? 'bg-ember-100 font-bold text-navy-900' : isPlaceholder ? 'italic text-navy-400' : 'text-navy-500'
        )}
      >
        {isWinner && align === 'left' && <Check className="size-3 shrink-0 text-ember-600" strokeWidth={3} />}
        <span className="truncate">{label}</span>
        {isWithdrawn && <UserX className="size-3 shrink-0 text-danger" />}
        {isWinner && align === 'right' && <Check className="size-3 shrink-0 text-ember-600" strokeWidth={3} />}
      </span>
    </span>
  )
}
