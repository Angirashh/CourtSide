import { useState } from 'react'
import { toast } from 'sonner'
import { Clock3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { useRescheduleCourt } from '@/hooks/use-tournaments'
import { extractErrorMessage } from '@/lib/api/client'

export function RescheduleCourtDialog({
  tournamentId,
  courtId,
  courtName,
  currentFirstStart,
}: {
  tournamentId: string
  courtId: string
  courtName: string
  /** ISO timestamp of this court's current earliest not-yet-started match. */
  currentFirstStart: string
}) {
  const [open, setOpen] = useState(false)
  const current = new Date(currentFirstStart)
  const [date, setDate] = useState(currentFirstStart.slice(0, 10))
  const [time, setTime] = useState(
    `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`
  )
  const reschedule = useRescheduleCourt(tournamentId)

  function handleSubmit() {
    reschedule.mutate(
      { courtId, payload: { new_start_time: `${date}T${time}:00` } },
      {
        onSuccess: (res) => {
          if (res.delta_minutes === 0) {
            toast.success(`${courtName}'s start time is unchanged.`)
          } else {
            const direction = res.delta_minutes > 0 ? 'later' : 'earlier'
            const matchWord = res.shifted_matches_count === 1 ? 'match' : 'matches'
            toast.success(
              `${courtName} shifted ${Math.abs(res.delta_minutes)} min ${direction} — ${res.shifted_matches_count} ${matchWord} moved.`
            )
          }
          setOpen(false)
        },
        onError: (err) => toast.error(extractErrorMessage(err)),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-court-cream/45 transition-colors hover:bg-white/10 hover:text-court-cream"
          title={`Edit ${courtName}'s start time`}
          aria-label={`Edit ${courtName}'s start time`}
        >
          <Clock3 className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {courtName}&rsquo;s start time</DialogTitle>
          <DialogDescription>
            If this court isn&rsquo;t actually free until later than planned — or frees up earlier — move its next
            match. Every other upcoming match already scheduled on this court shifts by the same amount, keeping the
            gaps between them, and its booking window and cost update to match. The usual rest-time cushion isn&rsquo;t
            enforced here — only a genuine double-booking (two overlapping matches for the same player) is refused.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2.5">
          <div className="flex-1 space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label>New start time</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button loading={reschedule.isPending} disabled={!date || !time} onClick={handleSubmit}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
