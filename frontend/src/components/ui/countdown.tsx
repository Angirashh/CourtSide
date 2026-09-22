import { useEffect, useState } from 'react'
import { Timer } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Below this gap to a tournament's date, callers should show the countdown instead of just the date. */
export const COUNTDOWN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000 // "less than a month away"

type CountdownVariant = 'dark' | 'light'

/** A ticking days/hours/min/sec countdown to `target`. Caller decides whether it's worth showing. */
export function Countdown({
  target,
  label = 'Countdown to first serve',
  variant = 'dark',
}: {
  target: Date
  label?: string
  variant?: CountdownVariant
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const remainingMs = Math.max(0, target.getTime() - now)
  const days = Math.floor(remainingMs / 86_400_000)
  const hours = Math.floor((remainingMs % 86_400_000) / 3_600_000)
  const minutes = Math.floor((remainingMs % 3_600_000) / 60_000)
  const seconds = Math.floor((remainingMs % 60_000) / 1_000)

  return (
    <div>
      <p
        className={cn(
          'mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[.16em]',
          variant === 'dark' ? 'text-ember-400' : 'text-ember-600'
        )}
      >
        <Timer className="size-3" /> {label}
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        <CountdownUnit value={days} label="days" variant={variant} />
        <CountdownUnit value={hours} label="hrs" variant={variant} />
        <CountdownUnit value={minutes} label="min" variant={variant} />
        <CountdownUnit value={seconds} label="sec" variant={variant} />
      </div>
    </div>
  )
}

function CountdownUnit({ value, label, variant }: { value: number; label: string; variant: CountdownVariant }) {
  return (
    <div
      className={cn(
        'rounded-lg border py-2 text-center',
        variant === 'dark' ? 'border-navy-700 bg-navy-800/60' : 'border-cream-200 bg-cream-50'
      )}
    >
      <p
        className={cn(
          'font-display text-lg font-medium tabular-nums sm:text-xl',
          variant === 'dark' ? 'text-cream-50' : 'text-navy-900'
        )}
      >
        {String(value).padStart(2, '0')}
      </p>
      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-navy-400">{label}</p>
    </div>
  )
}
