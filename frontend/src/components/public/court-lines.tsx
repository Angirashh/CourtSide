import { cn } from '@/lib/utils'

/** Decorative skewed orange line pattern, anchored top-right of any `relative overflow-hidden`
 * dark panel. Shared across the tournament hero, the landing page's live section, and its
 * "starting soon" section so the three keep the same accent. */
export function CourtLines({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute -right-10 -top-10 h-[210px] w-[220px]', className)}>
      <div className="absolute inset-0 skew-x-[-18deg] border border-ember-500/25" />
      <div className="absolute inset-[28px] skew-x-[-18deg] border border-ember-500/25" />
      <div className="absolute left-0 right-0 top-1/2 h-px skew-x-[-18deg] bg-ember-500/25" />
    </div>
  )
}
