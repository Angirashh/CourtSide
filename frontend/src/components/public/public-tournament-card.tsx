import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, MapPin, Medal, Trophy, Users } from 'lucide-react'
import { InitialsAvatar } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { InfoPill } from '@/components/ui/info-pill'
import { TournamentStatusBadge } from '@/components/ui/status-badge'
import { categoryMeta } from '@/lib/tournament-category'
import { formatMeta } from '@/lib/tournament-format'
import { cn, formatPlainDate } from '@/lib/utils'
import type { PublicTournamentSummary } from '@/types/api'

// Keyed by podium place so a future bronze_medalist_name just needs a `{ place: 3, name }`
// entry pushed in podiumEntries() below -- the themed card it renders in already exists here.
const PODIUM_THEME: Record<number, { label: string; icon: typeof Trophy; wrapClassName: string; iconClassName: string }> = {
  0: { label: 'Tied', icon: Medal, wrapClassName: 'border-white/15 bg-white/5', iconClassName: 'text-court-cream/60' },
  1: { label: 'Winner', icon: Trophy, wrapClassName: 'border-amber-400/30 bg-amber-400/10', iconClassName: 'text-amber-400' },
  2: { label: 'Runner-up', icon: Medal, wrapClassName: 'border-slate-300/25 bg-slate-300/10', iconClassName: 'text-slate-300' },
  3: { label: 'Bronze', icon: Medal, wrapClassName: 'border-orange-600/30 bg-orange-600/10', iconClassName: 'text-orange-500' },
}

type PlacementEntry = { place: number; name: string; sub?: string }

function podiumEntries(tournament: PublicTournamentSummary): PlacementEntry[] {
  const entries: PlacementEntry[] = []
  if (tournament.champion_name) entries.push({ place: 1, name: tournament.champion_name })
  if (tournament.runner_up_name) entries.push({ place: 2, name: tournament.runner_up_name })
  return entries
}

// TEAM_FRIENDLY tournaments have no champion_name/runner_up_name (no individual podium) --
// their result lives in team_friendly_result instead, as two team scorelines rather than names.
function teamFriendlyEntries(tournament: PublicTournamentSummary): PlacementEntry[] {
  const r = tournament.team_friendly_result
  if (!r) return []
  const a: PlacementEntry = {
    place: r.winner === 'A' ? 1 : r.winner === 'B' ? 2 : 0,
    name: 'Team A',
    sub: `${r.team_a_matches_won}-${r.team_b_matches_won} matches`,
  }
  const b: PlacementEntry = {
    place: r.winner === 'B' ? 1 : r.winner === 'A' ? 2 : 0,
    name: 'Team B',
    sub: `${r.team_b_matches_won}-${r.team_a_matches_won} matches`,
  }
  return r.winner === 'B' ? [b, a] : [a, b]
}

export function PublicTournamentCard({ tournament, delayMs = 0 }: { tournament: PublicTournamentSummary; delayMs?: number }) {
  const category = tournament.category ? categoryMeta[tournament.category] : null
  const format = formatMeta[tournament.format]
  const podium = podiumEntries(tournament)
  const placements = podium.length > 0 ? podium : teamFriendlyEntries(tournament)
  return (
    <Link
      to={`/tournaments/${tournament.id}`}
      className="group block h-full animate-fade-up active:scale-[0.98]"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <Card className="relative flex h-full flex-col overflow-hidden bg-[#100C0B] p-0 transition-[transform,border-color,box-shadow] duration-300 group-hover:-translate-y-1 group-hover:border-ember-300/60 group-hover:shadow-lg group-hover:shadow-navy-900/10">
        <div className="relative min-h-32 shrink-0 bg-[url('/images/hero-rackets.jpg')] bg-cover bg-center">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_55%_at_50%_-10%,rgba(255,101,56,0.18),transparent_65%)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#100C0B] via-[#100C0B]/70 to-[#100C0B]/15" />
          <div className="relative flex flex-col gap-1.5 p-4">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-bold leading-none text-court-cream backdrop-blur-sm">
                <format.icon className="size-3" aria-hidden="true" />
                {format.label}
              </span>
              {category && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ember-100 px-2 py-1 text-[11px] font-bold leading-none text-ember-600">
                  <category.icon className="size-3" aria-hidden="true" />
                  {category.label}
                </span>
              )}
            </div>
            <h3 className="min-w-0 font-display text-xl leading-snug text-court-cream group-hover:text-ember-600 transition-colors line-clamp-2">
              {tournament.name}
            </h3>
            <span className="self-start">
              <TournamentStatusBadge status={tournament.status} />
            </span>
          </div>
        </div>
        <div className="relative flex flex-1 flex-col p-4">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 backdrop-blur-md">
            <InfoPill icon={MapPin} label="Venue" value={tournament.venue ?? 'Venue TBD'} className="min-w-0 flex-1" />
            <div className="h-8 w-px shrink-0 bg-white/10" />
            <InfoPill
              icon={CalendarDays}
              label="Date"
              value={tournament.tournament_date ? formatPlainDate(tournament.tournament_date) : 'Date TBD'}
              className="min-w-0 flex-1"
            />
          </div>
          {placements.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {placements.map((entry, i) => {
                const theme = PODIUM_THEME[entry.place] ?? PODIUM_THEME[3]
                return (
                  <div
                    key={`${entry.place}-${i}`}
                    className={cn('flex min-w-[120px] flex-1 items-center gap-2 rounded-2xl border px-3 py-2.5', theme.wrapClassName)}
                  >
                    <theme.icon className={cn('size-4 shrink-0', theme.iconClassName)} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-court-cream/45">{theme.label}</p>
                      <p className="truncate text-sm font-bold text-court-cream">{entry.name}</p>
                      {entry.sub && <p className="truncate text-xs font-medium text-court-cream/50">{entry.sub}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-auto flex items-center justify-between gap-3 pt-3">
            <div className="flex min-w-0 items-center gap-2">
              {tournament.participant_names.length > 0 && (
                <div className="flex shrink-0 items-center">
                  {tournament.participant_names.slice(0, 3).map((name, i) => (
                    <InitialsAvatar
                      key={name + i}
                      name={name}
                      seed={name}
                      size="sm"
                      className={cn('ring-2 ring-[#100C0B]', i > 0 && '-ml-2.5')}
                    />
                  ))}
                  {tournament.players_count > tournament.participant_names.length && (
                    <div className="-ml-2.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-court-cream ring-2 ring-[#100C0B]">
                      +{tournament.players_count - tournament.participant_names.length}
                    </div>
                  )}
                </div>
              )}
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-court-cream">
                <Users className="size-3.5 shrink-0 text-ember-400" aria-hidden="true" />
                <span className="truncate">
                  {tournament.players_count} {tournament.tournament_type === 'TEAM' ? 'teams' : 'players'}
                </span>
              </span>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ember-500/40 px-3 py-1.5 text-xs font-bold text-ember-500 transition-colors group-hover:border-ember-400 group-hover:bg-ember-500/10">
              {tournament.status === 'IN_PROGRESS' ? 'Watch live' : 'Details'} <ArrowRight className="size-3.5" aria-hidden="true" />
            </span>
          </div>
        </div>
      </Card>
    </Link>
  )
}
