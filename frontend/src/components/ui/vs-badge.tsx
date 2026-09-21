import { cn } from '@/lib/utils'

export function VsBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'mx-1.5 inline-flex shrink-0 items-center rounded-full bg-ember-100 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-ember-600',
        className
      )}
    >
      vs
    </span>
  )
}
