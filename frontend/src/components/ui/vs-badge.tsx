import { cn } from '@/lib/utils'

const sizeClasses = {
  sm: { badge: 'px-1.5 py-0.5', text: 'text-[10px]' },
  md: { badge: 'px-2.5 py-0.5', text: 'text-sm' },
}

export function VsBadge({ className, size = 'sm' }: { className?: string; size?: keyof typeof sizeClasses }) {
  return (
    <span
      className={cn(
        'mx-1.5 inline-flex shrink-0 skew-x-[-10deg] items-center rounded-lg bg-ember-500 shadow-sm',
        sizeClasses[size].badge,
        className
      )}
    >
      <span className={cn('block skew-x-[10deg] font-display leading-none tracking-wide text-white', sizeClasses[size].text)}>
        VS
      </span>
    </span>
  )
}
