import { Clock, MapPin } from 'lucide-react'
import { useMatch } from 'react-router-dom'
import { useMyNextMatch } from '@/hooks/use-players'
import { useAuthStore } from '@/stores/auth-store'
import { Badge } from '@/components/ui/badge'
import { VsBadge } from '@/components/ui/vs-badge'
import { cn, formatTime, prettifyPlaceholderName } from '@/lib/utils'
import type { NextMatch } from '@/types/api'

/**
 * Pinned under the top nav, in the app shell rather than the tournament page itself, so it
 * survives any navigation within this tournament rather than being scoped to one page's own
 * layout -- a logged-in player's own next (or currently live) match, so they don't have to
 * hunt the fixtures tab to find out when they're on. Tournament context comes from the URL
 * (`/tournaments/:id`), so it only ever renders while actually on that tournament's page --
 * there's no cross-tournament "my next match anywhere" lookup here. Renders nothing outside
 * that route, for a logged-out visitor, a non-player, or a player with no unfinished match in
 * this tournament (not registered, eliminated, schedule not out yet, or tournament not started).
 */
export function StickyNextMatchBar() {
  const match = useMatch('/tournaments/:id')
  const tournamentId = match?.params.id

  const isPlayer = useAuthStore((s) => s.user?.role === 'PLAYER')
  const { data: nextMatch } = useMyNextMatch(tournamentId, isPlayer)

  if (!nextMatch) return null

  return (
    <NextMatchBarContent
      nextMatch={nextMatch}
      className="sticky top-16 z-20 border-b border-ember-500/25 bg-ink/97 px-4 py-2.5 backdrop-blur-sm sm:px-6 lg:top-[72px] lg:px-10"
    />
  )
}

/**
 * Same "up next" bar content, for embedding inline on the home page's Live section (one per
 * live tournament, between its "All matches" CTA and its court-queue cards) rather than
 * pinned to the app shell. Not sticky -- it's scoped to whichever tournament's OnCourtCard it
 * sits inside, and that card already scrolls normally with the rest of the section.
 */
export function NextMatchBar({ tournamentId, className }: { tournamentId: string; className?: string }) {
  const isPlayer = useAuthStore((s) => s.user?.role === 'PLAYER')
  const { data: nextMatch } = useMyNextMatch(tournamentId, isPlayer)

  if (!nextMatch) return null

  return (
    <NextMatchBarContent
      nextMatch={nextMatch}
      className={cn('animate-fade-up rounded-xl border border-ember-500/25 bg-[#100C0B] px-3.5 py-2.5', className)}
    />
  )
}

function NextMatchBarContent({ nextMatch, className }: { nextMatch: NextMatch; className?: string }) {
  const opponentName = nextMatch.opponent_is_placeholder
    ? prettifyPlaceholderName(nextMatch.opponent_name)
    : nextMatch.opponent_name
  const isLive = nextMatch.status === 'IN_PROGRESS'

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="relative flex size-1.5 shrink-0">
        {isLive && <span className="absolute inline-flex size-full animate-ping rounded-full bg-ember-500 opacity-75" />}
        <span
          className={cn(
            'relative inline-flex size-1.5 rounded-full',
            isLive ? 'bg-ember-500' : 'bg-warning shadow-[0_0_6px_2px_rgba(217,165,63,0.7)]'
          )}
        />
      </span>

      <span className={cn('shrink-0 font-sans text-[11px] font-bold uppercase tracking-wide', isLive ? 'text-ember-400' : 'text-warning')}>
        {isLive ? "You're on court now" : 'Up next'}
      </span>

      {!isLive && nextMatch.scheduled_start_time && (
        <>
          <Separator />
          <Badge variant="warning" className="shrink-0 gap-1 px-2 py-0.5 text-[11px]">
            <Clock className="size-3" />~{formatTime(nextMatch.scheduled_start_time)}
          </Badge>
        </>
      )}

      <Separator />
      <span className="flex min-w-0 items-center gap-1.5">
        <VsBadge size="sm" live={isLive} className="mx-0 shrink-0" />
        <span className="truncate font-sans text-[13px] font-semibold text-court-cream">{opponentName}</span>
      </span>

      {nextMatch.court_name && (
        <>
          <Separator />
          <Badge variant="outline" className="shrink-0 gap-1 border-white/15 px-2 py-0.5 text-[11px] text-court-cream/80">
            <MapPin className="size-3 text-ember-400" />
            {nextMatch.court_name}
          </Badge>
        </>
      )}
    </div>
  )
}

function Separator() {
  return <span className="shrink-0 text-court-cream/25">&middot;</span>
}
