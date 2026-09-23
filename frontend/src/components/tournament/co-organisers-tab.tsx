import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { Mail, Phone, Plus, UserMinus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { FullPageSpinner } from '@/components/ui/spinner'
import { useAddCoOrganiser, useCoOrganisers, useRemoveCoOrganiser } from '@/hooks/use-co-organisers'
import { extractErrorMessage } from '@/lib/api/client'
import { formatDate, initials } from '@/lib/utils'
import type { CoOrganiser } from '@/types/api'

const addSchema = z.object({
  identifier: z.string().min(3, 'Enter their email or phone'),
})

export function CoOrganisersTab({ tournamentId }: { tournamentId: string }) {
  const { data: coOrganisers, isLoading } = useCoOrganisers(tournamentId)
  const [open, setOpen] = useState(false)
  const add = useAddCoOrganiser(tournamentId)
  const remove = useRemoveCoOrganiser(tournamentId)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof addSchema>>({
    resolver: zodResolver(addSchema),
  })

  const onSubmit = handleSubmit((values) => {
    add.mutate(values.identifier, {
      onSuccess: (res) => {
        toast.success(`${res.name} can now manage this tournament.`)
        reset()
        setOpen(false)
      },
      onError: (err) => toast.error(extractErrorMessage(err)),
    })
  })

  function handleRemove(co: CoOrganiser) {
    remove.mutate(co.organiser_id, {
      onSuccess: () => toast.success(`${co.name} removed.`),
      onError: (err) => toast.error(extractErrorMessage(err)),
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-navy-500">
          Give another organiser's account full access to this tournament — same as your own.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-3.5" />
              Add co-organiser
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a co-organiser</DialogTitle>
              <DialogDescription>They must already have an approved Courtside organiser account.</DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label>Email or phone</Label>
                <Input placeholder="they@club.com" {...register('identifier')} />
                <FieldError>{errors.identifier?.message}</FieldError>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={add.isPending}>
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <FullPageSpinner />
      ) : !coOrganisers || coOrganisers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No co-organisers yet"
          description="Add another organiser's account to share full management of this tournament with them."
        />
      ) : (
        <div className="space-y-3">
          {coOrganisers.map((co) => (
            <Card key={co.organiser_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-cream-50">
                  {initials(co.name)}
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="break-words text-sm font-semibold text-navy-900">{co.name}</p>
                  {co.email && (
                    <p className="flex items-center gap-1.5 break-all text-xs text-navy-500">
                      <Mail className="size-3 shrink-0" /> {co.email}
                    </p>
                  )}
                  {co.phone && (
                    <p className="flex items-center gap-1.5 break-words text-xs text-navy-500">
                      <Phone className="size-3 shrink-0" /> {co.phone}
                    </p>
                  )}
                  <p className="text-[11px] text-navy-400">Added {formatDate(co.added_at)}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="self-start text-danger hover:bg-danger-bg sm:self-center"
                disabled={remove.isPending}
                onClick={() => handleRemove(co)}
              >
                <UserMinus className="size-3.5" />
                Remove
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
