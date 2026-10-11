import { cn } from '@/lib/utils'

const sizeClasses = {
  sm: { badge: 'px-1.5 py-0.5', text: 'text-[10px]' },
  md: { badge: 'px-2 py-0.5', text: 'text-xs' },
}

export function VsBadge({
  className,
  size = 'sm',
  live = false,
}: {
  className?: string
  size?: keyof typeof sizeClasses
  live?: boolean
}) {
  return (
    <span
      className={cn(
        'mx-1.5 inline-flex shrink-0 items-center justify-center rounded-[4px] border border-white/10 bg-white/[0.06] shadow-sm',
        live ? 'text-[#ff5722]' : 'text-court-cream/70',
        sizeClasses[size].badge,
        className
      )}
    >
      <span className={cn('font-display leading-none tracking-wide', sizeClasses[size].text)}>VS</span>
    </span>
  )
}
