import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { useUpdateTournamentDetails } from '@/hooks/use-tournaments'
import { extractErrorMessage } from '@/lib/api/client'

const editSchema = z.object({
  venue: z.string().min(2, 'Enter a venue'),
  tournament_date: z.string().min(1, 'Pick a date'),
})

export function EditTournamentDetailsDialog({
  tournamentId,
  venue,
  tournamentDate,
}: {
  tournamentId: string
  venue: string | null
  tournamentDate: string | null
}) {
  const [open, setOpen] = useState(false)
  const update = useUpdateTournamentDetails(tournamentId)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    values: { venue: venue ?? '', tournament_date: tournamentDate ?? '' },
  })

  const onSubmit = handleSubmit((values) => {
    update.mutate(values, {
      onSuccess: () => {
        toast.success('Tournament details updated.')
        setOpen(false)
      },
      onError: (err) => toast.error(extractErrorMessage(err)),
    })
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-navy-400 transition-colors hover:bg-navy-100 hover:text-navy-900"
          title="Edit venue and date"
          aria-label="Edit venue and date"
        >
          <Pencil className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit venue &amp; date</DialogTitle>
          <DialogDescription>
            Updates the tournament's logistics info. If a schedule is already generated, its match times aren't
            recalculated — regenerate the schedule if the new date should apply to fixtures too.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label>Venue</Label>
            <Input placeholder="Koramangala Indoor Stadium" {...register('venue')} />
            <FieldError>{errors.venue?.message}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label>Tournament date</Label>
            <Input type="date" {...register('tournament_date')} />
            <FieldError>{errors.tournament_date?.message}</FieldError>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={update.isPending}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
