import { useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { FileUp, Info, Plus, Shuffle, Trash2, Upload, UserX, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { useDeleteAllPlayers, useRegisterPlayer, useUploadRoster, useWithdrawPlayer } from '@/hooks/use-players'
import { useFinalizeSeeding } from '@/hooks/use-tournaments'
import { extractErrorMessage } from '@/lib/api/client'
import { cn, initials } from '@/lib/utils'
import type { Player, TournamentStatus } from '@/types/api'

export function RosterTab({ tournamentId, status, players }: { tournamentId: string; status: TournamentStatus; players: Player[] }) {
  const realPlayers = players.filter((p) => !p.is_placeholder).sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999))
  const finalizeSeeding = useFinalizeSeeding(tournamentId)
  // A schedule already exists once SCHEDULING, but nothing's played yet, so roster edits
  // (add / upload / withdraw) are still safe — the organiser just needs to regenerate after.
  const canEditRoster = status === 'DRAFT' || status === 'SCHEDULING'

  return (
    <div className="space-y-5">
      {status === 'SCHEDULING' && (
        <div className="flex items-start gap-2 rounded-lg border border-ember-300 bg-ember-100/40 px-3.5 py-2.5 text-xs font-medium text-navy-700">
          <Info className="mt-0.5 size-3.5 shrink-0 text-ember-600" />
          Changed the roster? Use "Regenerate schedule" at the top of this page so fixtures reflect withdrawals and
          new players.
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
            {status === 'DRAFT' && realPlayers.length > 0 && (
              <DeleteAllPlayersDialog tournamentId={tournamentId} count={realPlayers.length} />
            )}
          </>
        )}
        <span className="ml-auto text-xs font-semibold text-navy-400">{realPlayers.length} registered</span>
      </div>

      {realPlayers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No players yet"
          description="Add players one at a time, or upload a CSV/XLSX roster to bulk-import."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-cream-200">
            {realPlayers.map((player) => (
              <PlayerRow key={player.id} player={player} tournamentId={tournamentId} canWithdraw={status !== 'DRAFT' && status !== 'COMPLETED' && !player.is_withdrawn} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function PlayerRow({ player, tournamentId, canWithdraw }: { player: Player; tournamentId: string; canWithdraw: boolean }) {
  const withdraw = useWithdrawPlayer(tournamentId)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  return (
    <li className={cn('flex items-center gap-3 px-4 py-3', player.is_withdrawn && 'bg-danger-bg/30')}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy-100 text-xs font-bold text-navy-600">
        {player.seed ?? '–'}
      </div>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[11px] font-bold text-cream-50">
        {initials(player.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-navy-900">{player.name}</p>
        {player.is_withdrawn && (
          <p className="truncate text-xs text-danger">Withdrawn{player.withdrawal_reason ? ` · ${player.withdrawal_reason}` : ''}</p>
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
                Any pending match with a known opponent is immediately walked over. This can't be undone.
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
  seed: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().min(1, 'Seed must be at least 1').optional()
  ),
})

function AddPlayerDialog({ tournamentId }: { tournamentId: string }) {
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
    register.mutate(values, {
      onSuccess: () => {
        toast.success(`${values.name} added to the roster.`)
        reset()
        setOpen(false)
      },
      onError: (err) => toast.error(extractErrorMessage(err)),
    })
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-3.5" />
          Add player
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a player</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input placeholder="Player name" {...bind('name')} />
            <FieldError>{errors.name?.message}</FieldError>
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
            This clears the whole roster so you can upload or add a fresh set of players. This can't be undone.
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
            'flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
            file ? 'border-ember-400 bg-ember-100/30' : 'border-navy-200 hover:border-navy-300'
          )}
        >
          <FileUp className="size-6 text-navy-400" />
          <p className="text-sm font-semibold text-navy-700">{file ? file.name : 'Choose a file'}</p>
          <p className="text-xs text-navy-400">.csv or .xlsx</p>
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
