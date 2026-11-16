import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function InfoPill({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: LucideIcon
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ember-500/15 text-ember-400">
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-court-cream/45">{label}</p>
        <p className="truncate text-sm font-bold text-court-cream">{value}</p>
      </div>
    </div>
  )
}
