import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, MapPin, Users } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { TournamentStatusBadge } from '@/components/ui/status-badge'
import { categoryMeta } from '@/lib/tournament-category'
import { formatLabel, formatPlainDate, initials } from '@/lib/utils'
import type { PublicTournamentSummary } from '@/types/api'

export function PublicTournamentCard({ tournament, delayMs = 0 }: { tournament: PublicTournamentSummary; delayMs?: number }) {
  const category = tournament.category ? categoryMeta[tournament.category] : null
  return (
    <Link to={`/tournaments/${tournament.id}`} className="group block h-full animate-fade-up" style={{ animationDelay: `${delayMs}ms` }}>
      <Card className="relative h-full overflow-hidden p-5 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-ember-300/60 group-hover:shadow-lg group-hover:shadow-navy-900/10">
        <div className="flex items-start justify-between gap-2">
          <div className="flex size-10 items-center justify-center rounded-xl bg-navy-900 font-display text-xs font-bold text-ember-400">
            {initials(tournament.name)}
          </div>
          <TournamentStatusBadge status={tournament.status} />
        </div>
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-[.14em] text-navy-400">{formatLabel(tournament.format)}</p>
            {category && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ember-100 px-2 py-1 text-[11px] font-bold leading-none text-ember-600">
                <category.icon className="size-3" />
                {category.label}
              </span>
            )}
          </div>
          <h3 className="mt-1.5 font-display text-lg font-medium leading-snug text-navy-900 group-hover:text-ember-600 transition-colors">
            {tournament.name}
          </h3>
        </div>
        <div className="mt-5 flex flex-col gap-1.5 border-t border-cream-200 pt-3.5 text-xs text-navy-500">
          <div className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{tournament.venue ?? 'Venue TBD'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5 shrink-0" />
            {tournament.tournament_date ? formatPlainDate(tournament.tournament_date) : 'Date TBD'}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-cream-200 pt-3.5">
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-navy-400">
            <Users className="size-3.5" /> {tournament.players_count} players
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-navy-900 group-hover:text-ember-600">
            {tournament.status === 'IN_PROGRESS' ? 'Watch live' : 'Details'} <ArrowRight className="size-3.5" />
          </span>
        </div>
      </Card>
    </Link>
  )
}
