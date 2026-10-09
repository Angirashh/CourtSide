import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { MapPin, Plus, Settings2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { useAddCourt, useRemoveCourt, useUpdateCourt } from '@/hooks/use-tournaments'
import { extractErrorMessage } from '@/lib/api/client'
import type { Court, Match } from '@/types/api'

const courtsSchema = z.object({
  courts: z
    .array(
      z.object({
        courtId: z.string().optional(),
        name: z.string().min(1, 'Name required'),
        hourly_rate: z.coerce.number().min(0),
        available_from_minutes: z.coerce.number().min(0).max(1440),
      })
    )
    .min(1, 'Add at least one court'),
})

type FormInput = z.input<typeof courtsSchema>
type FormOutput = z.output<typeof courtsSchema>

export function EditCourtsDialog({ tournamentId, courts, matches }: { tournamentId: string; courts: Court[]; matches: Match[] }) {
  const [open, setOpen] = useState(false)
  const addCourt = useAddCourt(tournamentId)
  const updateCourt = useUpdateCourt(tournamentId)
  const removeCourt = useRemoveCourt(tournamentId)
  const [submitting, setSubmitting] = useState(false)

  const busyCourtIds = new Set(matches.filter((m) => !m.is_completed && m.court_id).map((m) => m.court_id as string))

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(courtsSchema),
    values: {
      courts: courts.map((c) => ({
        courtId: c.id,
        name: c.name,
        hourly_rate: c.hourly_rate,
        available_from_minutes: c.available_from_minutes,
      })),
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'courts' })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    const keptIds = new Set(values.courts.map((c) => c.courtId).filter(Boolean))
    const removedCourts = courts.filter((c) => !keptIds.has(c.id))

    const renamedNotice = values.courts
      .map((c) => {
        const original = c.courtId ? courts.find((o) => o.id === c.courtId) : undefined
        return original && original.name !== c.name && busyCourtIds.has(original.id)
          ? { from: original.name, to: c.name }
          : null
      })
      .filter((x): x is { from: string; to: string } => !!x)

    const results = await Promise.allSettled([
      ...removedCourts.map((c) => removeCourt.mutateAsync(c.id)),
      ...values.courts.map((c) => {
        const original = c.courtId ? courts.find((o) => o.id === c.courtId) : undefined
        if (!original) {
          return addCourt.mutateAsync({
            name: c.name,
            hourly_rate: c.hourly_rate,
            available_from_minutes: c.available_from_minutes,
          })
        }
        if (
          original.name !== c.name ||
          original.hourly_rate !== c.hourly_rate ||
          original.available_from_minutes !== c.available_from_minutes
        ) {
          return updateCourt.mutateAsync({
            courtId: original.id,
            payload: { name: c.name, hourly_rate: c.hourly_rate, available_from_minutes: c.available_from_minutes },
          })
        }
        return Promise.resolve(original)
      }),
    ])

    setSubmitting(false)
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]

    if (failed.length === 0) {
      toast.success('Courts updated.')
      for (const notice of renamedNotice) {
        toast.info(`Court renamed from "${notice.from}" to "${notice.to}" — it had a match on it.`)
      }
      setOpen(false)
    } else {
      failed.forEach((f) => toast.error(extractErrorMessage(f.reason)))
    }
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
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-court-cream/45 transition-colors hover:bg-white/10 hover:text-court-cream"
          title="Edit courts"
          aria-label="Edit courts"
        >
          <Settings2 className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit courts</DialogTitle>
          <DialogDescription>
            Add, rename, or remove courts any time — before or during the tournament. Renaming is always safe, even
            mid-match. A court with a scheduled or in-progress match on it can't be removed until that match wraps up.
            If a court isn&rsquo;t free until later than the others — say 3 courts from 1:00pm but a 4th not until
            1:30pm — set how many minutes late it opens; the next schedule generation plans around it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3.5">
          <div className="space-y-2.5">
            {fields.map((field, idx) => {
              const isBusy = !!field.courtId && busyCourtIds.has(field.courtId)
              return (
                <div key={field.id} className="rounded-lg border border-white/10 p-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-court-cream/55">
                      <MapPin className="size-4" />
                    </div>
                    <Input placeholder="Court name" className="flex-1" {...register(`courts.${idx}.name` as const)} />
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      disabled={fields.length === 1 || isBusy}
                      title={isBusy ? "Can't remove — has a match on it right now" : 'Remove court'}
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-court-cream/45 transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-30"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-2.5 pl-11">
                    <div className="space-y-1">
                      <Label className="text-xs font-normal text-court-cream/55">Rate (₹/hr)</Label>
                      <Input type="number" min={0} {...register(`courts.${idx}.hourly_rate` as const)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-normal text-court-cream/55">Opens late by (min)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={1440}
                        title="Minutes after the tournament's start time before this court opens"
                        {...register(`courts.${idx}.available_from_minutes` as const)}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <FieldError>{errors.courts?.message}</FieldError>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ name: `Court ${fields.length + 1}`, hourly_rate: 300, available_from_minutes: 0 })}
          >
            <Plus className="size-3.5" />
            Add court
          </Button>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
