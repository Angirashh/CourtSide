import { useState } from 'react'
import { Bell, Check, Mail, Phone, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useApproveOrganiser, usePendingOrganisers, useRejectOrganiser } from '@/hooks/use-auth'
import { extractErrorMessage } from '@/lib/api/client'
import { cn, formatDateTime, initials } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Superadmin-only. New organiser signups land in `is_approved=False` and can't log in until
 * approved here — see backend/app/api/routes_auth.py's organiser/pending|approve|reject routes.
 * Hidden entirely for regular organisers (no is_superadmin flag).
 */
export function OrganiserApprovalsBell({ compact }: { compact?: boolean }) {
  const isSuperadmin = useAuthStore((s) => s.user?.is_superadmin ?? false)
  const [open, setOpen] = useState(false)
  const { data: pending } = usePendingOrganisers(isSuperadmin)
  const count = pending?.length ?? 0

  if (!isSuperadmin) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'relative flex items-center justify-center rounded-full transition-colors',
          compact ? 'size-9 bg-navy-100 text-navy-600' : 'size-9 text-cream-200/70 hover:bg-cream-50/10 hover:text-cream-50'
        )}
        aria-label="Pending organiser requests"
      >
        <Bell className="size-4" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-ember-500 text-[9px] font-bold text-navy-950">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      <DialogContent sheet>
        <DialogHeader>
          <DialogTitle>Organiser requests</DialogTitle>
          <DialogDescription>People waiting to be let into Courtside as an organiser.</DialogDescription>
        </DialogHeader>
        {count === 0 ? (
          <EmptyState icon={UserRound} title="Nothing pending" description="New organiser signups will show up here." />
        ) : (
          <div className="space-y-2.5">
            {pending!.map((p) => (
              <PendingOrganiserRow key={p.id} id={p.id} name={p.name} email={p.email} phone={p.phone} requestedAt={p.created_at} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PendingOrganiserRow({
  id,
  name,
  email,
  phone,
  requestedAt,
}: {
  id: string
  name: string
  email: string | null
  phone: string | null
  requestedAt: string
}) {
  const approve = useApproveOrganiser()
  const reject = useRejectOrganiser()
  const busy = approve.isPending || reject.isPending

  return (
    <div className="flex items-center gap-3 rounded-xl border border-navy-100 bg-cream-25 p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-cream-50">
        {initials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-navy-900">{name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-navy-400">
          {email && (
            <span className="flex items-center gap-1">
              <Mail className="size-3" /> {email}
            </span>
          )}
          {phone && (
            <span className="flex items-center gap-1">
              <Phone className="size-3" /> {phone}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-navy-300">Requested {formatDateTime(requestedAt)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          size="icon"
          variant="outline"
          className="size-8 border-danger/30 text-danger hover:bg-danger-bg"
          disabled={busy}
          onClick={() => reject.mutate(id, { onError: (err) => toast.error(extractErrorMessage(err)) })}
          aria-label={`Decline ${name}`}
        >
          <X className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="primary"
          className="size-8"
          disabled={busy}
          onClick={() =>
            approve.mutate(id, {
              onSuccess: () => toast.success(`${name} approved.`),
              onError: (err) => toast.error(extractErrorMessage(err)),
            })
          }
          aria-label={`Approve ${name}`}
        >
          <Check className="size-4" />
        </Button>
      </div>
    </div>
  )
}
