import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { Crown, FileUp, Info, Pencil, Plus, Shuffle, Trash2, Upload, UserX, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { InitialsAvatar } from '@/components/ui/avatar'
import {
  useDeleteAllPlayers,
  useRegisterPlayer,
  useUpdatePlayerTeamAssignments,
  useUpdateTeamAssignments,
  useUploadRoster,
  useWithdrawPlayer,
} from '@/hooks/use-players'
import { useAddTournamentTeam, useFinalizeSeeding, useUpdateTournamentTeam } from '@/hooks/use-tournaments'
import { extractErrorMessage } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import type { Player, TeamTieConfig, TournamentFormat, TournamentStatus, TournamentTeam, TournamentType } from '@/types/api'

export function RosterTab({
  tournamentId,
  status,
  format,
  tournamentType,
  players,
  teams,
  teamConfig,
}: {
  tournamentId: string
  status: TournamentStatus
  format: TournamentFormat
  tournamentType: TournamentType
  players: Player[]
  teams: TournamentTeam[]
  teamConfig: TeamTieConfig | null
}) {
  const [teamAssignmentDraft, setTeamAssignmentDraft] = useState<Record<string, string | null>>({})
  const realPlayers = players.filter((p) => !p.is_placeholder).sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999))
  const finalizeSeeding = useFinalizeSeeding(tournamentId)
  const saveTeamAssignments = useUpdatePlayerTeamAssignments(tournamentId)
  // Quick inline reassignment only applies to the TEAM format (TEAM_FRIENDLY's side/captain
  // assignment is edited as a full draft via TeamFriendlyPanel below, not per-row here).
  const pendingTeamAssignments = tournamentType === 'TEAM'
    ? realPlayers.flatMap((player) =>
      Object.prototype.hasOwnProperty.call(teamAssignmentDraft, player.id) && teamAssignmentDraft[player.id] !== player.team_id
        ? [{ player_id: player.id, team_id: teamAssignmentDraft[player.id] ?? null }]
        : []
    )
    : []
  // A schedule already exists once SCHEDULING, but nothing's played yet, so roster edits
  // (add / upload / withdraw) are still safe — the organiser just needs to regenerate after.
  const canEditRoster = status === 'DRAFT' || status === 'SCHEDULING'

  return (
    <div className="space-y-5">
      {tournamentType === 'TEAM' && (
        <TeamSetup tournamentId={tournamentId} players={realPlayers} teams={teams} teamConfig={teamConfig} canEdit={canEditRoster} />
      )}
      {(status === 'SCHEDULING' || pendingTeamAssignments.length > 0) && (
        <div className="flex items-start gap-2 rounded-lg border border-ember-300/60 bg-ember-500/10 px-3.5 py-2.5 text-xs font-medium text-court-cream/70">
          <Info className="mt-0.5 size-3.5 shrink-0 text-ember-600" />
          {pendingTeamAssignments.length > 0
            ? status === 'SCHEDULING'
              ? 'Save team assignments, then regenerate the schedule so fixtures use the updated roster.'
              : 'Save team assignments before generating the schedule.'
            : 'Changed the roster? Use "Regenerate schedule" at the top of this page so fixtures reflect withdrawals and new players.'}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        {canEditRoster && (
          <>
            <AddPlayerDialog tournamentId={tournamentId} />
            <UploadRosterDialog tournamentId={tournamentId} />
            <Button
              variant="outline"
              size="sm"
              loading={finalizeSeeding.isPending}
              disabled={realPlayers.length < 2}
              onClick={() =>
                finalizeSeeding.mutate(undefined, {
                  onSuccess: () => toast.success('Seeding finalized from global rankings.'),
                  onError: (err) => toast.error(extractErrorMessage(err)),
                })
              }
            >
              <Shuffle className="size-3.5" />
              Finalize seeding
            </Button>
            {pendingTeamAssignments.length > 0 && (
              <Button
                variant="primary"
                size="sm"
                loading={saveTeamAssignments.isPending}
                onClick={() => saveTeamAssignments.mutate(pendingTeamAssignments, {
                  onSuccess: () => {
                    setTeamAssignmentDraft({})
                    toast.success('Team assignments saved.')
                  },
                  onError: (err) => toast.error(extractErrorMessage(err)),
                })}
              >
                Save assignments ({pendingTeamAssignments.length})
              </Button>
            )}
            {status === 'DRAFT' && realPlayers.length > 0 && (
              <DeleteAllPlayersDialog tournamentId={tournamentId} count={realPlayers.length} />
            )}
          </>
        )}
        <span className="ml-auto text-xs font-semibold text-court-cream/45">{realPlayers.length} registered</span>
      </div>

      {format === 'TEAM_FRIENDLY' && realPlayers.length > 0 && (
        <TeamFriendlyPanel tournamentId={tournamentId} players={realPlayers} canEdit={canEditRoster} />
      )}

      {realPlayers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No players yet"
          description="Add players one at a time, or upload a CSV/XLSX roster to bulk-import."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-white/10">
            {realPlayers.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                tournamentId={tournamentId}
                teams={teams}
                allowTeamAssignment={tournamentType === 'TEAM' && canEditRoster}
                assignedTeamId={Object.prototype.hasOwnProperty.call(teamAssignmentDraft, player.id) ? teamAssignmentDraft[player.id] : player.team_id}
                savingTeamAssignments={saveTeamAssignments.isPending}
                onTeamAssignmentChange={(teamId) => setTeamAssignmentDraft((current) => {
                  const next = { ...current }
                  if (teamId === player.team_id) delete next[player.id]
                  else next[player.id] = teamId
                  return next
                })}
                canWithdraw={status !== 'DRAFT' && status !== 'COMPLETED' && !player.is_withdrawn}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

type TeamDraft = Record<string, { team: 'A' | 'B' | null; isCaptain: boolean }>

function TeamFriendlyPanel({
  tournamentId,
  players,
  canEdit,
}: {
  tournamentId: string
  players: Player[]
  canEdit: boolean
}) {
  const teamEligible = players.filter((p) => !p.is_withdrawn)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<TeamDraft>({})
  const updateTeamAssignments = useUpdateTeamAssignments(tournamentId)

  function enterEditMode() {
    const seeded: TeamDraft = {}
    for (const p of teamEligible) seeded[p.id] = { team: p.team, isCaptain: p.is_captain }
    setDraft(seeded)
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
    setDraft({})
  }

  function setDraftTeam(playerId: string, team: 'A' | 'B') {
    setDraft((prev) => {
      const current = prev[playerId]
      if (!current || current.team === team) return prev
      return { ...prev, [playerId]: { team, isCaptain: false } }
    })
  }

  function setCaptain(team: 'A' | 'B', playerId: string) {
    setDraft((prev) => {
      const next = { ...prev }
      for (const id of Object.keys(next)) {
        if (next[id].team === team) next[id] = { ...next[id], isCaptain: id === playerId }
      }
      return next
    })
  }

  function clearCaptain(team: 'A' | 'B') {
    setDraft((prev) => {
      const next = { ...prev }
      for (const id of Object.keys(next)) {
        if (next[id].team === team) next[id] = { ...next[id], isCaptain: false }
      }
      return next
    })
  }

  function save() {
    const assignments = Object.entries(draft).map(([player_id, v]) => ({
      player_id,
      team: v.team,
      is_captain: v.isCaptain,
    }))
    updateTeamAssignments.mutate(assignments, {
      onSuccess: () => {
        toast.success('Team assignments saved.')
        setIsEditing(false)
        setDraft({})
      },
      onError: (err) => toast.error(extractErrorMessage(err)),
    })
  }

  if (!isEditing) {
    const teamA = teamEligible.filter((p) => p.team === 'A')
    const teamB = teamEligible.filter((p) => p.team === 'B')
    const unassigned = teamEligible.filter((p) => !p.team)
    const balanced = teamA.length === teamB.length && teamA.length > 0

    return (
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-court-cream">Team assignments</h3>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={enterEditMode}>
              <Pencil className="size-3.5" />
              Edit teams
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TeamGroup label="Team A" players={teamA} />
          <TeamGroup label="Team B" players={teamB} />
        </div>
        {unassigned.length > 0 && (
          <p className="text-xs font-medium text-ember-600">{unassigned.length} player(s) not yet assigned to a team.</p>
        )}
        {!balanced && (teamA.length > 0 || teamB.length > 0) && (
          <p className="text-xs font-medium text-ember-600">Teams must match in size to generate the schedule.</p>
        )}
      </Card>
    )
  }

  const draftTeamA = teamEligible.filter((p) => draft[p.id]?.team === 'A')
  const draftTeamB = teamEligible.filter((p) => draft[p.id]?.team === 'B')
  const balanced = draftTeamA.length === draftTeamB.length && draftTeamA.length > 0

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-court-cream">Edit team assignments</h3>
        <span className={cn('text-xs font-semibold', balanced ? 'text-court-cream/45' : 'text-ember-600')}>
          Team A: {draftTeamA.length} · Team B: {draftTeamB.length}
          {!balanced && ' — teams must match to generate'}
        </span>
      </div>

      <ul className="divide-y divide-white/10 rounded-lg border border-white/10">
        {teamEligible.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-3 py-2">
            <InitialsAvatar name={p.name} seed={p.athlete_id ?? p.id} size="sm" />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-court-cream">{p.name}</p>
            <div className="flex shrink-0 rounded-full border border-white/20 p-0.5">
              {(['A', 'B'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={draft[p.id]?.team === t}
                  onClick={() => setDraftTeam(p.id, t)}
                  className={cn(
                    'rounded-full px-2 py-1 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500 focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
                    draft[p.id]?.team === t ? 'bg-navy-900 text-cream-50' : 'text-court-cream/45 hover:text-court-cream/70'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 sm:grid-cols-2">
        <CaptainSelect label="Team A captain" team="A" players={draftTeamA} draft={draft} onSelect={setCaptain} onClear={clearCaptain} />
        <CaptainSelect label="Team B captain" team="B" players={draftTeamB} draft={draft} onSelect={setCaptain} onClear={clearCaptain} />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={cancelEdit}>
          Cancel
        </Button>
        <Button loading={updateTeamAssignments.isPending} onClick={save}>
          Save teams
        </Button>
      </div>
    </Card>
  )
}

function TeamGroup({ label, players }: { label: string; players: Player[] }) {
  return (
    <div className="rounded-lg border border-white/10 p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-court-cream/45">
        {label} · {players.length}
      </p>
      {players.length === 0 ? (
        <p className="text-xs text-court-cream/45">No players yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {players.map((p) => (
            <li key={p.id} className="flex items-center gap-1.5 text-sm text-court-cream/85">
              {p.is_captain && <Crown className="size-3.5 shrink-0 text-ember-500" />}
              <span className="truncate">{p.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CaptainSelect({
  label,
  team,
  players,
  draft,
  onSelect,
  onClear,
}: {
  label: string
  team: 'A' | 'B'
  players: Player[]
  draft: TeamDraft
  onSelect: (team: 'A' | 'B', playerId: string) => void
  onClear: (team: 'A' | 'B') => void
}) {
  const currentCaptain = players.find((p) => draft[p.id]?.isCaptain)
  const hasPlayers = players.length > 0

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={hasPlayers ? currentCaptain?.id ?? '__none__' : undefined}
        onValueChange={(value) => (value === '__none__' ? onClear(team) : onSelect(team, value))}
        disabled={!hasPlayers}
      >
        <SelectTrigger>
          <SelectValue placeholder={hasPlayers ? 'No captain' : 'No players on this team yet'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No captain</SelectItem>
          {players.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function PlayerRow({
  player,
  tournamentId,
  teams,
  allowTeamAssignment,
  assignedTeamId,
  savingTeamAssignments,
  onTeamAssignmentChange,
  canWithdraw,
}: {
  player: Player
  tournamentId: string
  teams: TournamentTeam[]
  allowTeamAssignment: boolean
  assignedTeamId: string | null | undefined
  savingTeamAssignments: boolean
  onTeamAssignmentChange: (teamId: string | null) => void
  canWithdraw: boolean
}) {
  const withdraw = useWithdrawPlayer(tournamentId)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  return (
    <li className={cn('flex items-center gap-3 px-4 py-3', allowTeamAssignment && 'flex-wrap sm:flex-nowrap', player.is_withdrawn && 'bg-danger-bg/30')}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-court-cream/60">
        {player.seed ?? '–'}
      </div>
      <InitialsAvatar name={player.name} seed={player.athlete_id ?? player.id} size="sm" />
      <div className="min-w-0 flex-1">
        {player.athlete_id && !player.is_placeholder ? (
          <Link to={`/players/${player.athlete_id}`} className="block truncate text-sm font-semibold text-court-cream hover:underline">
            {player.name}
          </Link>
        ) : (
          <p className="truncate text-sm font-semibold text-court-cream">{player.name}</p>
        )}
        {player.is_withdrawn && (
          <p className="truncate text-xs text-danger">Withdrawn{player.withdrawal_reason ? ` · ${player.withdrawal_reason}` : ''}</p>
        )}
        {allowTeamAssignment && (
          <TeamAssignment
            player={player}
            teams={teams}
            teamId={assignedTeamId ?? null}
            disabled={savingTeamAssignments}
            onChange={onTeamAssignmentChange}
          />
        )}
      </div>
      {player.is_withdrawn ? (
        <Badge variant="danger">
          <UserX className="size-3" />
          Out
        </Badge>
      ) : canWithdraw ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-bg">
              Withdraw
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Withdraw {player.name}?</DialogTitle>
              <DialogDescription>
                Any pending match with a known opponent is immediately walked over. This can’t be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Input placeholder="e.g. Ankle injury" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={withdraw.isPending}
                onClick={() =>
                  withdraw.mutate(
                    { playerId: player.id, reason: reason || undefined },
                    {
                      onSuccess: (res) => {
                        toast.success(`${player.name} withdrawn — ${res.walkover_matches.length} match(es) walked over.`)
                        setOpen(false)
                        setReason('')
                      },
                      onError: (err) => toast.error(extractErrorMessage(err)),
                    }
                  )
                }
              >
                Confirm withdrawal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </li>
  )
}

const addPlayerSchema = z.object({
  name: z.string().min(1, 'Enter a name'),
  email: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.string().email('Enter a valid email').optional()
  ),
  seed: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().min(1, 'Seed must be at least 1').optional()
  ),
})

function AddPlayerDialog({ tournamentId, teamId, teamName }: { tournamentId: string; teamId?: string; teamName?: string }) {
  const [open, setOpen] = useState(false)
  const register = useRegisterPlayer(tournamentId)
  const { register: bind, handleSubmit, reset, formState: { errors } } = useForm<
    z.input<typeof addPlayerSchema>,
    unknown,
    z.output<typeof addPlayerSchema>
  >({
    resolver: zodResolver(addPlayerSchema),
  })

  const onSubmit = handleSubmit((values) => {
    register.mutate({ ...values, ...(teamId ? { team_id: teamId } : {}) }, {
      onSuccess: () => {
        toast.success(teamName ? `${values.name} added to ${teamName}.` : `${values.name} added to the roster.`)
        reset()
        setOpen(false)
      },
      onError: (err) => toast.error(extractErrorMessage(err)),
    })
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={teamId ? 'outline' : undefined}>
          <Plus className="size-3.5" />
          Add player
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{teamName ? `Add a player to ${teamName}` : 'Add a player'}</DialogTitle>
          {teamName && <DialogDescription>This player will also be added to the tournament roster.</DialogDescription>}
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input placeholder="Player name" {...bind('name')} />
            <FieldError>{errors.name?.message}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label>Email (optional)</Label>
            <Input type="email" placeholder="player@example.com" {...bind('email')} />
            <FieldError>{errors.email?.message}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label>Seed (optional)</Label>
            <Input type="number" placeholder="Leave blank to auto-seed later" {...bind('seed')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={register.isPending}>
              Add player
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteAllPlayersDialog({ tournamentId, count }: { tournamentId: string; count: number }) {
  const [open, setOpen] = useState(false)
  const deleteAll = useDeleteAllPlayers(tournamentId)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-danger hover:bg-danger-bg">
          <Trash2 className="size-3.5" />
          Delete all
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete all {count} players?</DialogTitle>
          <DialogDescription>
            This clears the whole roster so you can upload or add a fresh set of players. This can’t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={deleteAll.isPending}
            onClick={() =>
              deleteAll.mutate(undefined, {
                onSuccess: (res) => {
                  toast.success(`Roster cleared — ${res.deleted_count} players removed.`)
                  setOpen(false)
                },
                onError: (err) => toast.error(extractErrorMessage(err)),
              })
            }
          >
            Delete all players
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UploadRosterDialog({ tournamentId }: { tournamentId: string }) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadRoster(tournamentId)

  function handleUpload() {
    if (!file) return
    upload.mutate(file, {
      onSuccess: (res) => {
        toast.success(`Roster uploaded — ${res.stats.total_processed} players added.`)
        setOpen(false)
        setFile(null)
      },
      onError: (err) => toast.error(extractErrorMessage(err)),
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="size-3.5" />
          Upload roster
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload roster</DialogTitle>
          <DialogDescription>CSV or XLSX with a "name" column (email/phone/club optional, used to match returning players).</DialogDescription>
        </DialogHeader>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500 focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
            file ? 'border-ember-400 bg-ember-500/10' : 'border-white/20 hover:border-white/25'
          )}
        >
          <FileUp className="size-6 text-court-cream/45" aria-hidden="true" />
          <p className="text-sm font-semibold text-court-cream/70">{file ? file.name : 'Choose a file'}</p>
          <p className="text-xs text-court-cream/45">.csv or .xlsx</p>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!file} loading={upload.isPending} onClick={handleUpload}>
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TeamSetup({
  tournamentId,
  players,
  teams,
  teamConfig,
  canEdit,
}: {
  tournamentId: string
  players: Player[]
  teams: TournamentTeam[]
  teamConfig: TeamTieConfig | null
  canEdit: boolean
}) {
  const [name, setName] = useState('')
  const addTeam = useAddTournamentTeam(tournamentId)
  const updateTeam = useUpdateTournamentTeam(tournamentId)

  function createTeam() {
    const trimmed = name.trim()
    if (!trimmed || addTeam.isPending) return
    addTeam.mutate(trimmed, {
      onSuccess: () => {
        setName('')
        toast.success(`${trimmed} created.`)
      },
      onError: (err) => toast.error(extractErrorMessage(err)),
    })
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Teams</CardTitle>
            <CardDescription className="mt-1">Create teams, assign roster players, and choose a captain for each.</CardDescription>
          </div>
          <Badge variant="outline">{teams.length} {teams.length === 1 ? 'team' : 'teams'}</Badge>
        </div>
        {teamConfig && (
          <div className="space-y-2 border-t border-white/10 pt-3">
            <p className="text-xs font-semibold text-court-cream/55">Tie rules</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="neutral">{teamConfig.singles_matches} singles</Badge>
              <Badge variant="neutral">{teamConfig.doubles_matches} doubles</Badge>
              {teamConfig.mixed_doubles_matches > 0 && (
                <Badge variant="neutral">{teamConfig.mixed_doubles_matches} mixed doubles</Badge>
              )}
              <Badge variant="neutral">
                Max {teamConfig.max_singles_per_player} singles / {teamConfig.max_doubles_per_player} doubles
                {teamConfig.mixed_doubles_matches > 0 && ` / ${teamConfig.max_mixed_doubles_per_player} mixed doubles`} per player
              </Badge>
              <Badge variant="neutral">{teamConfig.completion_mode === 'MAJORITY' ? 'Finish at majority' : 'Play all games'}</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5" aria-label="Configured match order">
              {teamConfig.match_order.map((slot, index) => (
                <Badge key={`${slot}-${index}`} variant="outline">
                  {index + 1}. {slot === 'SINGLES' ? 'Singles' : slot === 'DOUBLES' ? 'Doubles' : 'Mixed Doubles'}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {canEdit && (
          <form
            className="flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row"
            onSubmit={(event) => { event.preventDefault(); createTeam() }}
          >
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter a team name" maxLength={80} />
            <Button type="submit" size="sm" loading={addTeam.isPending} disabled={!name.trim()} className="sm:shrink-0">
              <Plus className="size-3.5" />
              Add team
            </Button>
          </form>
        )}
      </CardHeader>
      {teams.length > 0 ? (
        <CardContent className="pt-0">
          <ul className="divide-y divide-white/10 border-t border-white/10">
            {teams.map((team) => {
              const members = players.filter((player) => player.team_id === team.id && !player.is_withdrawn)
              return (
                <li key={team.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-court-cream">{team.name}</p>
                      {canEdit && (
                        <TeamSeedField team={team} updateTeam={updateTeam} />
                      )}
                      {!canEdit && <Badge variant="outline">Seed {team.seed ?? '—'}</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-court-cream/45">{members.length} roster {members.length === 1 ? 'player' : 'players'}</p>
                    {canEdit && <div className="mt-2"><AddPlayerDialog tournamentId={tournamentId} teamId={team.id} teamName={team.name} /></div>}
                  </div>
                  <div className="flex min-w-0 items-center gap-2 sm:w-64 sm:shrink-0">
                    <Label htmlFor={`captain-${team.id}`} className="shrink-0 text-xs font-normal text-court-cream/55">Captain</Label>
                    <Select
                      value={team.captain_player_id ?? 'none'}
                      disabled={!canEdit || updateTeam.isPending || members.length === 0}
                      onValueChange={(value) => updateTeam.mutate(
                        { teamId: team.id, payload: { captain_player_id: value === 'none' ? null : value } },
                        { onError: (err) => toast.error(extractErrorMessage(err)) }
                      )}
                    >
                      <SelectTrigger id={`captain-${team.id}`} className="h-9 min-w-0 flex-1 text-xs">
                        <SelectValue placeholder="Choose a captain" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No captain selected</SelectItem>
                        {members.map((player) => <SelectItem key={player.id} value={player.id}>{player.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </li>
              )
            })}
          </ul>
        </CardContent>
      ) : (
        <CardContent className="pt-0">
          <p className="border-t border-white/10 pt-3 text-sm text-court-cream/50">
            No teams yet. Add a team here, then assign players from the roster below.
          </p>
        </CardContent>
      )}
    </Card>
  )
}

function TeamSeedField({ team, updateTeam }: { team: TournamentTeam; updateTeam: ReturnType<typeof useUpdateTournamentTeam> }) {
  const [value, setValue] = useState(String(team.seed ?? ''))
  useEffect(() => setValue(String(team.seed ?? '')), [team.seed])
  return (
    <Input
      aria-label={`${team.name} seed`}
      type="number"
      min={1}
      className="h-8 w-20"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        const seed = Number(value)
        if (Number.isInteger(seed) && seed > 0 && seed !== team.seed) {
          updateTeam.mutate({ teamId: team.id, payload: { seed } }, { onError: (err) => toast.error(extractErrorMessage(err)) })
        }
      }}
    />
  )
}

function TeamAssignment({
  player,
  teams,
  teamId,
  disabled,
  onChange,
}: {
  player: Player
  teams: TournamentTeam[]
  teamId: string | null
  disabled: boolean
  onChange: (teamId: string | null) => void
}) {
  return (
    <div className="mt-1.5 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
      <span className="shrink-0 text-[11px] text-court-cream/45">Team</span>
      <Select
        value={teamId ?? 'unassigned'}
        disabled={disabled || teams.length === 0}
        onValueChange={(value) => onChange(value === 'unassigned' ? null : value)}
      >
        <SelectTrigger aria-label={`Team for ${player.name}`} className="h-8 w-40 max-w-full px-2.5 text-xs">
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {teams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}
