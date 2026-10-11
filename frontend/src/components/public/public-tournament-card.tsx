import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, MapPin, Medal, Users } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { TournamentStatusBadge } from '@/components/ui/status-badge'
import { categoryMeta } from '@/lib/tournament-category'
import { formatLabel, formatPlainDate } from '@/lib/utils'
import type { PublicTournamentSummary } from '@/types/api'

function resultLine(tournament: PublicTournamentSummary): { headline: string; sub: string | null } | null {
  if (tournament.champion_name) {
    return {
      headline: tournament.champion_name,
      sub: tournament.runner_up_name ? `2nd ${tournament.runner_up_name}` : null,
    }
  }
  // TEAM_FRIENDLY tournaments have no champion_name/runner_up_name (no individual podium) --
  // their result lives in team_friendly_result instead, so this card fell through with no
  // result shown at all for that format until this check was added.
  const r = tournament.team_friendly_result
  if (r) {
    if (!r.winner) return { headline: 'Teams tied', sub: null }
    const [won, lost] = r.winner === 'A' ? [r.team_a_matches_won, r.team_b_matches_won] : [r.team_b_matches_won, r.team_a_matches_won]
    return { headline: `Team ${r.winner} won`, sub: `${won}–${lost} matches` }
  }
  return null
}

export function PublicTournamentCard({ tournament, delayMs = 0 }: { tournament: PublicTournamentSummary; delayMs?: number }) {
  const category = tournament.category ? categoryMeta[tournament.category] : null
  const result = resultLine(tournament)
  return (
    <Link to={`/tournaments/${tournament.id}`} className="group block h-full animate-fade-up" style={{ animationDelay: `${delayMs}ms` }}>
      <Card className="relative flex h-full flex-col overflow-hidden bg-[radial-gradient(ellipse_65%_55%_at_50%_-10%,rgba(255,101,56,0.1),transparent_65%)] p-4 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-ember-300/60 group-hover:shadow-lg group-hover:shadow-navy-900/10">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <p className="font-mono text-[10px] uppercase tracking-[.14em] text-court-cream/45">{formatLabel(tournament.format)}</p>
          {category && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ember-100 px-2 py-1 text-[11px] font-bold leading-none text-ember-600">
              <category.icon className="size-3" />
              {category.label}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 font-display text-lg leading-snug text-court-cream group-hover:text-ember-600 transition-colors line-clamp-2">
            {tournament.name}
          </h3>
          <TournamentStatusBadge status={tournament.status} />
        </div>
        <div className="mt-3 flex flex-col gap-1.5 border-t border-white/10 pt-3 text-xs text-court-cream/55">
          <div className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{tournament.venue ?? 'Venue TBD'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5 shrink-0" />
            {tournament.tournament_date ? formatPlainDate(tournament.tournament_date) : 'Date TBD'}
          </div>
        </div>
        {result && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-ember-500/20 bg-ember-500/10 px-2.5 py-1.5 text-xs font-semibold text-court-cream">
            <Medal className="size-3.5 shrink-0 text-ember-500" />
            <span className="truncate">{result.headline}</span>
            {result.sub && <span className="truncate font-normal text-court-cream/45">· {result.sub}</span>}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-success">
            <Users className="size-3.5" /> {tournament.players_count} players
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-court-cream group-hover:text-ember-600">
            {tournament.status === 'IN_PROGRESS' ? 'Watch live' : 'Details'} <ArrowRight className="size-3.5" />
          </span>
        </div>
      </Card>
    </Link>
  )
}
