import { memo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { Check, Copy, KeyRound, MapPin, Plus, RefreshCw, ShieldOff, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { FullPageSpinner } from '@/components/ui/spinner'
import { useInviteOperator, useOperators, useRevokeOperator } from '@/hooks/use-operators'
import { extractErrorMessage } from '@/lib/api/client'
import { cn, formatDate, initials } from '@/lib/utils'
import type { OperatorStatus } from '@/types/api'

const inviteSchema = z
  .object({
    name: z.string().min(1, 'Enter a name'),
    email: z.string().email('Enter a valid email').optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
  })
  .refine((d) => d.email || d.phone, { message: 'Add an email or phone', path: ['email'] })

export function OperatorsTab({ tournamentId }: { tournamentId: string }) {
  const { data: operators, isLoading } = useOperators(tournamentId)
  const [open, setOpen] = useState(false)
  // Invite codes are one-time — the backend only ever returns the plaintext PIN at the
  // moment it's (re)issued, then stores just a hash. So we remember whatever codes were
  // issued this session; anything older shows a "Get code" action to reissue a fresh one.
  const [codesByOperatorId, setCodesByOperatorId] = useState<Record<string, string>>({})

  const invite = useInviteOperator(tournamentId)
  const revoke = useRevokeOperator(tournamentId)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
  })

  const onSubmit = handleSubmit((values) => {
    invite.mutate(
      { name: values.name, email: values.email || undefined, phone: values.phone || undefined },
      {
        onSuccess: (res) => {
          setCodesByOperatorId((prev) => ({ ...prev, [res.operator_id]: res.invite_code }))
          reset()
          setOpen(false)
        },
        onError: (err) => toast.error(extractErrorMessage(err)),
      }
    )
  })

  function issueCode(op: OperatorStatus) {
    invite.mutate(
      { name: op.name, email: op.email ?? undefined, phone: op.phone ?? undefined },
      {
        onSuccess: (res) => {
          setCodesByOperatorId((prev) => ({ ...prev, [res.operator_id]: res.invite_code }))
          toast.success(`New code generated for ${op.name}.`)
        },
        onError: (err) => toast.error(extractErrorMessage(err)),
      }
    )
  }

  function handleRevoke(op: OperatorStatus) {
    revoke.mutate(op.operator_id, {
      onSuccess: () => toast.success(`${op.name}'s access revoked.`),
      onError: (err) => toast.error(extractErrorMessage(err)),
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-navy-500">Invite court operators with a one-time PIN scoped to this tournament.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="size-3.5" />
              Invite operator
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a court operator</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input placeholder="Operator name" {...register('name')} />
                <FieldError>{errors.name?.message}</FieldError>
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input placeholder="operator@example.com" {...register('email')} />
                <FieldError>{errors.email?.message}</FieldError>
              </div>
              <div className="space-y-1.5">
                <Label>Phone (optional)</Label>
                <Input placeholder="+91 98765 43210" {...register('phone')} />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={invite.isPending}>
                  <Plus className="size-3.5" />
                  Generate invite
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <FullPageSpinner />
      ) : !operators || operators.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No operators invited yet"
          description="Invite codes are shown once — share them with your court staff right after generating. You can always issue a fresh one later."
        />
      ) : (
        <div className="space-y-3">
          {operators.map((op) => (
            <OperatorRow
              key={op.operator_id}
              operator={op}
              code={codesByOperatorId[op.operator_id]}
              onIssueCode={issueCode}
              onRevoke={handleRevoke}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const OperatorRow = memo(
  function OperatorRow({
    operator,
    code,
    onIssueCode,
    onRevoke,
  }: {
    operator: OperatorStatus
    code?: string
    onIssueCode: (op: OperatorStatus) => void
    onRevoke: (op: OperatorStatus) => void
  }) {
    return (
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-3 sm:flex-1 sm:items-center">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-cream-50">
            {initials(operator.name)}
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="break-words text-sm font-semibold text-navy-900">{operator.name}</p>
            {operator.email && <p className="break-all text-xs text-navy-500">{operator.email}</p>}
            {operator.phone && <p className="break-words text-xs text-navy-500">{operator.phone}</p>}
            {!operator.email && !operator.phone && <p className="text-xs text-navy-400">—</p>}
            <p className="text-[11px] text-navy-400">Invited {formatDate(operator.invited_at)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
          <OperatorLiveStatusBadge operator={operator} />

          {code ? (
            <InviteCodeChip code={code} />
          ) : (
            <Button variant="outline" size="sm" onClick={() => onIssueCode(operator)}>
              <KeyRound className="size-3.5" />
              Get code
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1 sm:ml-0">
            <Button
              variant="ghost"
              size="sm"
              className="sm:h-10 sm:w-10 sm:px-0"
              title="Issue a new code"
              aria-label="Issue a new code"
              onClick={() => onIssueCode(operator)}
            >
              <RefreshCw className="size-4 text-navy-400" />
              <span className="sm:hidden">New code</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="sm:h-10 sm:w-10 sm:px-0"
              title="Revoke access"
              aria-label="Revoke access"
              disabled={operator.is_revoked}
              onClick={() => onRevoke(operator)}
            >
              <ShieldOff className="size-4 text-navy-400" />
              <span className="sm:hidden">Revoke</span>
            </Button>
          </div>
        </div>
      </Card>
    )
  },
  (prev, next) =>
    prev.code === next.code &&
    prev.operator.is_busy === next.operator.is_busy &&
    prev.operator.is_revoked === next.operator.is_revoked &&
    prev.operator.current_match_id === next.operator.current_match_id &&
    prev.operator.current_court?.id === next.operator.current_court?.id
)

function OperatorLiveStatusBadge({ operator }: { operator: OperatorStatus }) {
  if (operator.is_revoked) {
    return <Badge variant="danger">Revoked</Badge>
  }
  if (operator.is_busy && operator.current_court) {
    return (
      <Badge variant="ember" dot>
        <MapPin className="size-3" />
        {operator.current_court.name}
      </Badge>
    )
  }
  return <Badge variant="success">Idle</Badge>
}

function InviteCodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-lg bg-ember-100 px-2.5 py-1.5 font-mono text-xs font-bold text-ember-700 transition-colors hover:bg-ember-100/70'
      )}
    >
      {copied ? <Check className="size-3.5" /> : <KeyRound className="size-3.5" />}
      {code}
      <Copy className="size-3 opacity-50" />
    </button>
  )
}
