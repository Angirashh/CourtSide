import type { ReactNode } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

/** Shared confirm-before-destructive-action dialog. Caller owns `open` (closes it themselves
    in the mutation's onSuccess), same pattern as DeleteTournamentDialog. */
export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'danger',
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  title: ReactNode
  description: ReactNode
  confirmLabel?: string
  variant?: ButtonProps['variant']
  pending?: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={variant} loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
