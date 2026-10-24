import { Check, Clock, MapPin, UserX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { MatchStatusBadge } from '@/components/ui/status-badge'
import { VsBadge } from '@/components/ui/vs-badge'
import { cn, formatDuration, formatTime, parseUtcTimestamp, playerLabel } from '@/lib/utils'
import type { Match, Player } from '@/types/api'

export function FixtureMatchRow({
  match,
  playersById,
  courtName,
  index,
  isNextUp,
  variant = 'default',
}: {
  match: Match
  playersById: Map<string, Player>
  courtName?: string
  index?: number
  isNextUp?: boolean
  /** 'inline' mirrors the "up next" bar's look (ember card, dot + status eyebrow, pill-style
      time/court) -- used by the My Matches tab, where every match (not just the next one)
      deserves that same at-a-glance treatment. */
  variant?: 'default' | 'inline'
}) {
  const p1 = match.player1_id ? playersById.get(match.player1_id) : undefined
  const p2 = match.player2_id ? playersById.get(match.player2_id) : undefined
  const hasWinner = match.is_completed && !!match.winner_id
  const hasScores = !!match.scores?.length
  const isLive = match.status === 'IN_PROGRESS'
  const isCompleted = match.status === 'COMPLETED'
  // Real on-court time, not the scheduled slot -- how long the match actually took.
  const durationMinutes =
    match.is_completed && match.actual_start_time && match.actual_end_time
      ? Math.max(
          0,
          Math.round(
            (parseUtcTimestamp(match.actual_end_time).getTime() - parseUtcTimestamp(match.actual_start_time).getTime()) / 60000
          )
        )
      : null

  const nameFields = (
    <>
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
    </>
  )

  if (variant === 'inline') {
    return (
      <div className="rounded-xl border border-ember-500/25 bg-[#100C0B] px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {isCompleted ? (
            <MatchStatusBadge status="COMPLETED" className="shrink-0 px-2 py-0.5 text-[11px]" />
          ) : (
            <>
              <span className="relative flex size-1.5 shrink-0">
                {isLive && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-ember-500 opacity-75 motion-reduce:animate-none" />
                )}
                <span
                  className={cn(
                    'relative inline-flex size-1.5 rounded-full',
                    isLive ? 'bg-ember-500' : 'bg-warning shadow-[0_0_6px_2px_rgba(217,165,63,0.7)]'
                  )}
                />
              </span>

              <span
                className={cn(
                  'shrink-0 font-sans text-[11px] font-bold uppercase tracking-wide',
                  isLive ? 'text-ember-400' : 'text-warning'
                )}
              >
                {isLive ? 'On court now' : isNextUp ? 'Up next' : 'Scheduled'}
              </span>
            </>
          )}

          {!isLive && !isCompleted && match.scheduled_start_time && (
            <Badge variant="warning" className="shrink-0 gap-1 px-2 py-0.5 text-[11px]">
              <Clock className="size-3" aria-hidden="true" />~{formatTime(match.scheduled_start_time)}
            </Badge>
          )}

          {isCompleted && hasScores && (
            <span className="flex shrink-0 gap-1.5">
              {match.scores!.map((game, i) => (
                <span key={i} className="rounded-md bg-white/10 px-1.5 py-0.5 font-sans text-[11px] tabular-nums text-court-cream/55">
                  <span className={cn(game.p1 > game.p2 && 'font-bold text-court-cream')}>{game.p1}</span>
                  <span className="mx-0.5 text-court-cream/35">–</span>
                  <span className={cn(game.p2 > game.p1 && 'font-bold text-court-cream')}>{game.p2}</span>
                </span>
              ))}
            </span>
          )}

          {isCompleted && match.is_walkover && (
            <span className="shrink-0 font-sans text-[10px] font-bold uppercase tracking-wide text-court-cream/45">Walkover</span>
          )}

          {isCompleted && durationMinutes !== null && (
            <span className="inline-flex shrink-0 items-center gap-1 font-sans text-[11px] font-medium text-court-cream/55">
              <Clock className="size-3" aria-hidden="true" />
              {formatDuration(durationMinutes)}
            </span>
          )}

          {courtName && (
            <Badge variant="outline" className="ml-auto shrink-0 gap-1 border-white/15 px-2 py-0.5 text-[11px] text-court-cream/80">
              <MapPin className="size-3 text-ember-400" aria-hidden="true" />
              {courtName}
            </Badge>
          )}
        </div>

        <div className="mt-2 flex items-center gap-1.5">{nameFields}</div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-white/15 border-l-[3px] bg-[#100C0B] p-3',
        isLive ? 'border-l-[#ff5722]' : 'border-l-white/15'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {index !== undefined && (
          <span className="shrink-0 font-sans text-[8px] font-bold uppercase tracking-wide text-court-cream/45">
            Match {String(index).padStart(2, '0')}
          </span>
        )}
        {match.status === 'SCHEDULED' && isNextUp ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 font-sans text-[8px] font-bold uppercase tracking-wide text-court-cream/80">
            <span className="size-1.5 shrink-0 rounded-full bg-warning" />
            Next up
          </span>
        ) : (
          <MatchStatusBadge status={match.status} className="shrink-0 px-1.5 py-0.5 text-[8px] tracking-wide" />
        )}

        {!match.is_completed && match.scheduled_start_time && (
          <span className="inline-flex shrink-0 items-center gap-1 font-sans text-[11px] font-medium text-court-cream/55">
            <Clock className="size-3" aria-hidden="true" />
            {formatTime(match.scheduled_start_time)}
          </span>
        )}

        {hasScores && (
          <span className="flex shrink-0 gap-1.5">
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
          <span className="shrink-0 font-sans text-[10px] font-bold uppercase tracking-wide text-court-cream/45">Walkover</span>
        )}

        {durationMinutes !== null && (
          <span className="inline-flex shrink-0 items-center gap-1 font-sans text-[11px] font-medium text-court-cream/55">
            <Clock className="size-3" aria-hidden="true" />
            {formatDuration(durationMinutes)}
          </span>
        )}

        {courtName && (
          <span className="ml-auto inline-flex min-w-0 shrink-0 items-center gap-1 font-sans text-[11px] font-medium text-court-cream/55">
            <MapPin className="size-3" aria-hidden="true" />
            {courtName}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1.5">{nameFields}</div>
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
        {isWinner && align === 'left' && <Check className="size-3.5 shrink-0" strokeWidth={3} aria-hidden="true" />}
        <span className="min-w-0 truncate">{label}</span>
        {isWithdrawn && (
          <>
            <UserX className="size-3 shrink-0 text-danger" aria-hidden="true" />
            <span className="sr-only"> (withdrawn)</span>
          </>
        )}
        {isWinner && align === 'right' && <Check className="size-3.5 shrink-0" strokeWidth={3} aria-hidden="true" />}
      </span>
      {team && (
        <span className="font-sans text-[9px] font-bold uppercase tracking-wide text-court-cream/45">Team {team}</span>
      )}
    </span>
  )
}
