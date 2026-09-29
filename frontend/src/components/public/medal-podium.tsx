import { Medal } from 'lucide-react'
import { cn } from '@/lib/utils'

export function MedalPodium({
  eyebrow,
  champion,
  runnerUp,
  horizontal = false,
  className,
}: {
  eyebrow: string
  champion: string
  runnerUp?: string | null
  /** Overview page stacks on mobile, row on larger screens; the compact homepage card stays row always. */
  horizontal?: boolean
  className?: string
}) {
  return (
    <div className={cn('text-center', className)}>
      <p className="font-mono text-[10px] uppercase tracking-[.18em] text-ember-600">{eyebrow}</p>
      <h3 className="mt-1.5 font-display text-xl font-medium text-navy-900">Final results</h3>
      <div
        className={cn(
          'mt-6 flex items-center justify-center gap-8',
          horizontal ? 'flex-row gap-6' : 'flex-col sm:flex-row sm:gap-14'
        )}
      >
        <MedalPlace medal="gold" label="Champion" name={champion} />
        {runnerUp && <MedalPlace medal="silver" label="Runner-up" name={runnerUp} />}
      </div>
    </div>
  )
}

export function MedalPlace({ medal, label, name }: { medal: 'gold' | 'silver'; label: string; name: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={cn(
          'flex size-16 items-center justify-center rounded-full shadow-lg',
          medal === 'gold'
            ? 'bg-gradient-to-br from-amber-300 to-amber-600 shadow-amber-500/30'
            : 'bg-gradient-to-br from-slate-300 to-slate-500 shadow-slate-500/30'
        )}
      >
        <Medal className="size-8 text-white" strokeWidth={2} />
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[.15em] text-navy-400">{label}</p>
      <p className="max-w-[180px] truncate font-display text-lg font-medium text-navy-900">{name}</p>
    </div>
  )
}
