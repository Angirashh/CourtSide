import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Minus, Plus, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSubmitScore } from '@/hooks/use-matches'
import { extractErrorMessage } from '@/lib/api/client'
import { cn, playerLabel } from '@/lib/utils'
import type { Match, Player } from '@/types/api'

type SetScore = { p1: number; p2: number }

export function ScoreDialog({
  tournamentId,
  match,
  playersById,
  open,
  onOpenChange,
  onSubmitted,
}: {
  tournamentId: string
  match: Match
  playersById: Map<string, Player>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted?: () => void
}) {
  const [pickedWinnerId, setPickedWinnerId] = useState<string | null>(null)
  const [sets, setSets] = useState<SetScore[]>([{ p1: 0, p2: 0 }])
  const submit = useSubmitScore(tournamentId)

  const p1Label = playerLabel(match.player1_id, playersById)
  const p2Label = playerLabel(match.player2_id, playersById)

  const p1Sets = sets.filter((s) => s.p1 > s.p2).length
  const p2Sets = sets.filter((s) => s.p2 > s.p1).length
  // The scoreboard decides the winner; tapping a name only overrides it (e.g. a retirement).
  const scoreWinnerId = p1Sets > p2Sets ? match.player1_id : p2Sets > p1Sets ? match.player2_id : null
  const winnerId = pickedWinnerId ?? scoreWinnerId

  function updateSet(idx: number, key: keyof SetScore, value: number) {
    setPickedWinnerId(null)
    setSets((prev) => prev.map((s, i) => (i === idx ? { ...s, [key]: Math.max(0, Math.min(99, value || 0)) } : s)))
  }

  function pickWinner(id: string | null) {
    setPickedWinnerId(id)
    // Pre-fill the winner's side of an untouched first set so the score can't start out backwards.
    setSets((prev) =>
      prev.length === 1 && prev[0].p1 === 0 && prev[0].p2 === 0
        ? [id === match.player1_id ? { p1: 21, p2: 0 } : { p1: 0, p2: 21 }]
        : prev
    )
  }

  function handleSubmit() {
    if (!winnerId) {
      toast.error('Enter the score or tap the winner first.')
      return
    }
    const winnerSets = winnerId === match.player1_id ? p1Sets : p2Sets
    const loserSets = winnerId === match.player1_id ? p2Sets : p1Sets
    if (winnerSets <= loserSets) {
      toast.error("These scores don't match the selected winner. Check each set is entered under the right player.")
      return
    }
    submit.mutate(
      { matchId: match.id, winnerId, scores: sets },
      {
        onSuccess: () => {
          toast.success(`${playerLabel(winnerId, playersById)} wins.`)
          onOpenChange(false)
          setPickedWinnerId(null)
          setSets([{ p1: 0, p2: 0 }])
          onSubmitted?.()
        },
        onError: (err) => toast.error(extractErrorMessage(err)),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent sheet>
        <DialogHeader>
          <DialogTitle>Submit score</DialogTitle>
          <DialogDescription>Enter each set, or just tap the winner.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-3">
            {sets.map((set, idx) => (
              <div key={idx} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-court-cream/45">Set {idx + 1}</span>
                  {sets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSets((prev) => prev.filter((_, i) => i !== idx))}
                      className="flex size-8 items-center justify-center rounded-full text-court-cream/45 active:bg-danger-bg active:text-danger"
                      aria-label={`Remove set ${idx + 1}`}
                    >
                      <Minus className="size-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ScoreStepper label={p1Label} value={set.p1} onChange={(v) => updateSet(idx, 'p1', v)} />
                  <ScoreStepper label={p2Label} value={set.p2} onChange={(v) => updateSet(idx, 'p2', v)} />
                </div>
              </div>
            ))}
            {sets.length < 3 && (
              <Button type="button" variant="outline" className="w-full" onClick={() => setSets((prev) => [...prev, { p1: 0, p2: 0 }])}>
                <Plus className="size-4" />
                Add set
              </Button>
            )}
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-court-cream/45">Winner</p>
            <div className="grid grid-cols-2 gap-2.5">
              <WinnerOption label={p1Label} active={winnerId === match.player1_id} onClick={() => pickWinner(match.player1_id)} />
              <WinnerOption label={p2Label} active={winnerId === match.player2_id} onClick={() => pickWinner(match.player2_id)} />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" size="lg" className="sm:h-10 sm:text-sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="lg" className="sm:h-10 sm:text-sm" loading={submit.isPending} disabled={!winnerId} onClick={handleSubmit}>
            <Check className="size-4" />
            Confirm result
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ScoreStepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 truncate text-center text-xs font-semibold text-court-cream/60">{label}</p>
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          className="flex h-12 w-11 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-ink-card text-court-cream/60 active:scale-95 active:bg-white/10"
          aria-label={`Decrease ${label}`}
        >
          <Minus className="size-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-12 w-full min-w-0 rounded-lg border border-white/20 bg-ink-card text-center font-display text-2xl font-medium text-court-cream focus:border-ember-500 focus:outline-none"
          aria-label={`${label} score`}
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="flex h-12 w-11 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-ink-card text-court-cream/60 active:scale-95 active:bg-white/10"
          aria-label={`Increase ${label}`}
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  )
}

function WinnerOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-3 text-center transition-all active:scale-[0.98]',
        active ? 'border-ember-500 bg-ember-500/15 shadow-sm' : 'border-white/20'
      )}
    >
      <Trophy className={cn('size-5', active ? 'text-ember-600' : 'text-court-cream/35')} />
      <span className={cn('max-w-full truncate text-sm font-bold', active ? 'text-court-cream' : 'text-court-cream/60')}>{label}</span>
    </button>
  )
}
