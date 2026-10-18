import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ClipboardList, Send } from 'lucide-react'
import { useMyTeamTies, useSubmitTeamLineup } from '@/hooks/use-team-ties'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { extractErrorMessage } from '@/lib/api/client'
import type { Player, TeamTie, TournamentTeam } from '@/types/api'

export function CaptainLineupPanel({
  tournamentId,
  teams,
  players,
}: {
  tournamentId: string
  teams: TournamentTeam[]
  players: Player[]
}) {
  const { data: captainTies = [] } = useMyTeamTies(true)
  const activeTies = captainTies.filter((tie) => tie.tournament_id === tournamentId && !tie.is_completed)
  if (!activeTies.length) return null
  return (
    <section className="mb-5 space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-ember-400">Captain</p>
        <h2 className="font-display text-xl text-court-cream">Submit your team lineups</h2>
      </div>
      {activeTies.map((tie) => <CaptainTieCard key={tie.id} tournamentId={tournamentId} tie={tie} teams={teams} players={players} />)}
    </section>
  )
}

function CaptainTieCard({ tournamentId, tie, teams, players }: { tournamentId: string; tie: TeamTie; teams: TournamentTeam[]; players: Player[] }) {
  const teamId = tie.my_team_id
  const team = teams.find((row) => row.id === teamId)
  const team1 = teams.find((row) => row.id === tie.team1_id)
  const team2 = teams.find((row) => row.id === tie.team2_id)
  const roster = players.filter((player) => player.team_id === teamId && !player.is_withdrawn && !player.is_placeholder)
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const submit = useSubmitTeamLineup(tournamentId)

  useEffect(() => {
    if (!teamId) return
    setSelections(Object.fromEntries(tie.games.map((game) => [game.id, (teamId === tie.team1_id ? game.team1_player_ids : game.team2_player_ids) ?? []])))
  }, [teamId, tie.id, tie.games, tie.team1_id, tie.team2_id])

  if (!teamId || !team) return null
  const update = (gameId: string, index: number, playerId: string) => {
    setSelections((current) => {
      const playersForGame = [...(current[gameId] ?? [])]
      playersForGame[index] = playerId
      return { ...current, [gameId]: playersForGame }
    })
  }

  function handleSubmit() {
    const games = tie.games.map((game) => ({ game_id: game.id, player_ids: selections[game.id] ?? [] }))
    if (games.some((game) => game.player_ids.some((id) => !id))) {
      toast.error('Select players for every game before submitting.')
      return
    }
    submit.mutate({ tieId: tie.id, payload: { games } }, {
      onSuccess: () => toast.success('Lineup submitted to the organiser.'),
      onError: (error) => toast.error(extractErrorMessage(error)),
    })
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-4">
        <div className="min-w-0">
          <CardTitle className="leading-tight">{team.name} <span className="text-court-cream/35">vs</span> {teamId === tie.team1_id ? team2?.name : team1?.name}</CardTitle>
          <p className="mt-1 text-xs capitalize text-court-cream/45">{tie.group_id?.replaceAll('_', ' ') ?? tie.stage} · Round {tie.round_num}</p>
        </div>
        <Badge variant={tie.lineups_locked ? 'success' : 'outline'} className="shrink-0">{tie.lineups_locked ? 'Locked' : 'Submission open'}</Badge>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {!tie.lineups_locked ? tie.games.map((game) => {
          const count = game.match_type === 'SINGLES' ? 1 : 2
          return (
            <div key={game.id} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="font-sans text-xs font-semibold capitalize text-court-cream/65">Game {String(game.order_num).padStart(2, '0')} · {game.match_type.toLowerCase()}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: count }, (_, index) => (
                  <Select key={index} value={selections[game.id]?.[index] ?? 'none'} onValueChange={(value) => update(game.id, index, value === 'none' ? '' : value)}>
                    <SelectTrigger aria-label={`${game.match_type.toLowerCase()} player ${index + 1}`}><SelectValue placeholder={count === 1 ? 'Choose player' : `Player ${index + 1}`} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Choose player</SelectItem>
                      {roster.map((player) => <SelectItem key={player.id} value={player.id}>{player.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ))}
              </div>
            </div>
          )
        }) : <p className="flex items-center gap-2 text-sm text-court-cream/55"><ClipboardList className="size-4" />Your lineup is locked. Game lineups appear to both teams when each game begins.</p>}
        {!tie.lineups_locked && <Button size="sm" className="w-full sm:w-auto" loading={submit.isPending} onClick={handleSubmit}><Send className="size-3.5" />Submit lineup</Button>}
      </CardContent>
    </Card>
  )
}
