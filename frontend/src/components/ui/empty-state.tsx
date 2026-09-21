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
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-navy-200 bg-cream-25/60 px-6 py-14 text-center',
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-navy-100 text-navy-600">
        <Icon className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="font-display text-base font-medium text-navy-900">{title}</p>
        {description && <p className="max-w-sm text-sm text-navy-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}
