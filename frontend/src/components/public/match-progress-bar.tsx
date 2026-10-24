import { cn } from '@/lib/utils'

export function MatchProgressBar({ completed, total, className }: { completed: number; total: number; className?: string }) {
  if (total === 0) return null
  const pct = Math.round((completed / total) * 100)

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between text-xs font-semibold text-court-cream/55">
        <span>
          {completed} of {total} matches played
        </span>
        <span className="font-mono text-court-cream/45">{pct}%</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-ember-500 transition-transform duration-500"
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>
    </div>
  )
}
