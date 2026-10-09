import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-14 text-center',
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-white/10 text-court-cream/60">
        <Icon className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="font-display text-base font-medium text-court-cream">{title}</p>
        {description && <p className="max-w-sm text-sm text-court-cream/55">{description}</p>}
      </div>
      {action}
    </div>
  )
}
