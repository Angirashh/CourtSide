import { Check, Clock, MapPin, UserX } from 'lucide-react'
import { MatchStatusBadge } from '@/components/ui/status-badge'
import { VsBadge } from '@/components/ui/vs-badge'
import { cn, formatTime, playerLabel } from '@/lib/utils'
import type { Match, Player } from '@/types/api'

export function FixtureMatchRow({
  match,
  playersById,
  courtName,
  index,
  isNextUp,
}: {
  match: Match
  playersById: Map<string, Player>
  courtName?: string
  index?: number
  isNextUp?: boolean
}) {
  const p1 = match.player1_id ? playersById.get(match.player1_id) : undefined
  const p2 = match.player2_id ? playersById.get(match.player2_id) : undefined
  const hasWinner = match.is_completed && !!match.winner_id
  const hasScores = !!match.scores?.length
  const isLive = match.status === 'IN_PROGRESS'

  return (
    <div
      className={cn(
        'rounded-2xl border border-white/[0.06] border-l-[3px] bg-[#100C0B] p-3',
        isLive ? 'border-l-[#ff5722]' : 'border-l-white/[0.06]'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {index !== undefined && (
          <span className="font-sans text-[8px] font-bold uppercase tracking-wide text-court-cream/45">
            Match {String(index).padStart(2, '0')}
          </span>
        )}
        {match.status === 'SCHEDULED' && isNextUp ? (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 font-sans text-[8px] font-bold uppercase tracking-wide text-court-cream/80">
            <span className="size-1.5 shrink-0 rounded-full bg-warning" />
            Next up
          </span>
        ) : (
          <MatchStatusBadge status={match.status} className="ml-auto px-1.5 py-0.5 text-[8px] tracking-wide" />
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <Name
          label={playerLabel(match.player1_id, playersById)}
          isWinner={hasWinner && match.winner_id === match.player1_id}
          isWithdrawn={!!p1?.is_withdrawn}
          isPlaceholder={!!p1?.is_placeholder}
          team={p1?.team}
        />
        <VsBadge className="mx-0" size="md" live={isLive} />
        <Name
          label={match.is_bye ? 'Bye' : playerLabel(match.player2_id, playersById)}
          isWinner={hasWinner && !!match.player2_id && match.winner_id === match.player2_id}
          isWithdrawn={!!p2?.is_withdrawn}
          isPlaceholder={!!p2?.is_placeholder || match.is_bye}
          team={match.is_bye ? undefined : p2?.team}
          align="right"
        />
      </div>

      {(hasScores || match.is_walkover || (!match.is_completed && match.scheduled_start_time) || courtName) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2.5 border-t border-white/[0.05] pt-2">
          {courtName && (
            <span className="inline-flex items-center gap-1 font-sans text-[11px] font-medium text-court-cream/55">
              <MapPin className="size-3" />
              {courtName}
            </span>
          )}
          {hasScores && (
            <span className="flex gap-1.5">
              {match.scores!.map((game, i) => (
                <span key={i} className="rounded-md bg-white/10 px-1.5 py-0.5 font-sans text-[11px] tabular-nums text-court-cream/55">
                  <span className={cn(game.p1 > game.p2 && 'font-bold text-court-cream')}>{game.p1}</span>
                  <span className="mx-0.5 text-court-cream/35">–</span>
                  <span className={cn(game.p2 > game.p1 && 'font-bold text-court-cream')}>{game.p2}</span>
                </span>
              ))}
            </span>
          )}
          {match.is_walkover && (
            <span className="font-sans text-[10px] font-bold uppercase tracking-wide text-court-cream/45">Walkover</span>
          )}
          {!match.is_completed && match.scheduled_start_time && (
            <span className="inline-flex items-center gap-1 font-sans text-[11px] font-medium text-court-cream/55">
              <Clock className="size-3" />
              {formatTime(match.scheduled_start_time)}
            </span>
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
  team,
  align = 'left',
}: {
  label: string
  isWinner: boolean
  isWithdrawn: boolean
  isPlaceholder: boolean
  team?: 'A' | 'B' | null
  align?: 'left' | 'right'
}) {
  return (
    <span className={cn('flex min-w-0 flex-1 flex-col gap-0.5', align === 'right' ? 'items-end text-right' : 'items-start text-left')}>
      <span
        className={cn(
          'flex w-full min-w-0 items-center gap-1 font-display text-base leading-none',
          align === 'right' ? 'justify-end' : 'justify-start',
          isPlaceholder ? 'italic text-court-cream/45' : isWinner ? 'text-ember-600' : 'text-court-cream'
        )}
      >
        {isWinner && align === 'left' && <Check className="size-3.5 shrink-0" strokeWidth={3} />}
        <span className="min-w-0 truncate">{label}</span>
        {isWithdrawn && <UserX className="size-3 shrink-0 text-danger" />}
        {isWinner && align === 'right' && <Check className="size-3.5 shrink-0" strokeWidth={3} />}
      </span>
      {team && (
        <span className="font-sans text-[9px] font-bold uppercase tracking-wide text-court-cream/45">Team {team}</span>
      )}
    </span>
  )
}
