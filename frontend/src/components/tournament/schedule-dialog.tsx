import { useState } from 'react'
import { toast } from 'sonner'
import { CalendarClock, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { useGenerateSchedule } from '@/hooks/use-tournaments'
import { extractErrorMessage } from '@/lib/api/client'
import { formatPlainDate } from '@/lib/utils'
import type { TournamentFormat } from '@/types/api'

export function ScheduleDialog({
  tournamentId,
  format,
  tournamentDate,
  playerCount,
}: {
  tournamentId: string
  format: TournamentFormat
  tournamentDate: string | null
  playerCount: number
}) {
  const [open, setOpen] = useState(false)
  const [startTime, setStartTime] = useState('09:00')
  const [fallbackDate, setFallbackDate] = useState('')
  const date = tournamentDate ?? fallbackDate
  const [numGroups, setNumGroups] = useState(2)
  const recommendedRounds = Math.max(1, Math.ceil(Math.log2(playerCount + (playerCount % 2))))
  const maxRounds = Math.max(1, playerCount - 1)
  const [swissRounds, setSwissRounds] = useState<number | ''>('')
  const roundsValue = swissRounds === '' ? recommendedRounds : swissRounds
  const roundsInvalid = format === 'SWISS_KNOCKOUT' && (roundsValue < 1 || roundsValue > maxRounds)
  const generate = useGenerateSchedule(tournamentId)

  function handleSubmit() {
    generate.mutate(
      {
        // Sent as the literal venue wall-clock time (no UTC conversion) — the CP-SAT
        // solver and every downstream match time are relative to this exact string,
        // so it must match what the court schedule actually displays.
        start_time: `${date}T${startTime}:00`,
        num_groups: format === 'GROUP_KNOCKOUT' ? numGroups : undefined,
        num_swiss_rounds: format === 'SWISS_KNOCKOUT' ? roundsValue : undefined,
      },
      {
        onSuccess: (res) => {
          const savingsNote = res.savings > 0 ? ` Saved ₹${res.savings.toFixed(0)} vs. flat booking.` : ''
          toast.success(`Schedule generated — ${res.scheduled_matches_count} matches, ~${res.total_billable_hours}h, ₹${res.total_estimated_cost.toFixed(0)}.${savingsNote}`)
          setOpen(false)
        },
        onError: (err) => toast.error(extractErrorMessage(err)),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">
          <Wand2 className="size-4" />
          Generate schedule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate court schedule</DialogTitle>
          <DialogDescription>
            The solver builds every fixture and assigns courts/times to minimize total duration, then cost.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <CalendarClock className="size-3.5" />
              Tournament start time
            </Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            {tournamentDate ? (
              <p className="text-xs text-navy-400">On {formatPlainDate(tournamentDate)}, the date you set for this tournament.</p>
            ) : (
              <div className="space-y-1.5 pt-1">
                <Label>Tournament date</Label>
                <Input type="date" value={fallbackDate} onChange={(e) => setFallbackDate(e.target.value)} />
              </div>
            )}
          </div>
          {format === 'SWISS_KNOCKOUT' && (
            <div className="space-y-1.5">
              <Label>Number of Swiss rounds</Label>
              <Input
                type="number"
                min={1}
                max={maxRounds}
                value={roundsValue}
                onChange={(e) => setSwissRounds(e.target.value === '' ? '' : Number(e.target.value))}
              />
              <p className="text-xs text-navy-400">
                Recommended {recommendedRounds} for {playerCount} players (max {maxRounds}). Each round pairs players on
                similar records and never repeats an opponent. The top 4 then go to the knockout.
              </p>
            </div>
          )}
          {format === 'GROUP_KNOCKOUT' && (
            <div className="space-y-1.5">
              <Label>Number of groups</Label>
              <Input type="number" min={1} value={numGroups} onChange={(e) => setNumGroups(Number(e.target.value))} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button loading={generate.isPending} disabled={!startTime || !date || roundsInvalid} onClick={handleSubmit}>
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
