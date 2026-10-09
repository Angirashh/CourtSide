import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUpdateTournamentDetails } from '@/hooks/use-tournaments'
import { extractErrorMessage } from '@/lib/api/client'
import type { RegistrationStatus } from '@/types/api'

const registrationStatusOptions: { value: RegistrationStatus; label: string; hint: string }[] = [
  { value: 'NOT_OPEN', label: 'Not open yet', hint: "Players see \"Registrations will open soon.\"" },
  { value: 'OPEN', label: 'Open', hint: 'Players can self-register from the public site right now.' },
  { value: 'CLOSED', label: 'Closed', hint: 'Players see that registration is closed. Also set automatically once the roster cap is reached.' },
]

const editSchema = z.object({
  venue: z.string().min(2, 'Enter a venue'),
  venue_link: z.string().trim().url('Enter a valid URL (starting with https://)').optional().or(z.literal('')),
  tournament_date: z.string().min(1, 'Pick a date'),
  max_players: z
    .string()
    .optional()
    .refine((v) => !v || (Number.isInteger(Number(v)) && Number(v) >= 1), 'Enter a whole number of 1 or more'),
})

export function EditTournamentDetailsDialog({
  tournamentId,
  venue,
  venueLink,
  tournamentDate,
  registrationStatus,
  maxPlayers,
}: {
  tournamentId: string
  venue: string | null
  venueLink: string | null
  tournamentDate: string | null
  registrationStatus: RegistrationStatus
  maxPlayers: number | null
}) {
  const [open, setOpen] = useState(false)
  const [registrationStatusValue, setRegistrationStatusValue] = useState<RegistrationStatus>(registrationStatus)
  const update = useUpdateTournamentDetails(tournamentId)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    values: {
      venue: venue ?? '',
      venue_link: venueLink ?? '',
      tournament_date: tournamentDate ?? '',
      max_players: maxPlayers ? String(maxPlayers) : '',
    },
  })

  const onSubmit = handleSubmit(({ max_players, ...rest }) => {
    update.mutate(
      {
        ...rest,
        registration_status: registrationStatusValue,
        ...(max_players ? { max_players: Number(max_players) } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Tournament details updated.')
          setOpen(false)
        },
        onError: (err) => toast.error(extractErrorMessage(err)),
      }
    )
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setRegistrationStatusValue(registrationStatus)
        } else {
          reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-court-cream/45 transition-colors hover:bg-white/10 hover:text-court-cream"
          title="Edit venue and date"
          aria-label="Edit venue and date"
        >
          <Pencil className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit tournament details</DialogTitle>
          <DialogDescription>
            Updates the tournament's logistics and public registration settings. If a schedule is already
            generated, its match times aren't recalculated — regenerate the schedule if the new date should apply
            to fixtures too.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label>Venue</Label>
            <Input placeholder="Koramangala Indoor Stadium" {...register('venue')} />
            <FieldError>{errors.venue?.message}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label>Venue link (optional)</Label>
            <Input placeholder="https://maps.google.com/?q=..." {...register('venue_link')} />
            <FieldError>{errors.venue_link?.message}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label>Tournament date</Label>
            <Input type="date" {...register('tournament_date')} />
            <FieldError>{errors.tournament_date?.message}</FieldError>
          </div>

          <div className="space-y-1.5">
            <Label>Registration status</Label>
            <Select value={registrationStatusValue} onValueChange={(v) => setRegistrationStatusValue(v as RegistrationStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {registrationStatusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-court-cream/55">
              {registrationStatusOptions.find((opt) => opt.value === registrationStatusValue)?.hint}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Max players (optional)</Label>
            <Input type="number" min={1} placeholder="Uncapped" {...register('max_players')} />
            <FieldError>{errors.max_players?.message}</FieldError>
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
