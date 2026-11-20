import { cn, initials } from '@/lib/utils'

const AVATAR_COLORS = ['bg-ember-500', 'bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500']

// Every shade in the brand's ember ramp, darkest to lightest -- "mono" avatars cycle through
// these instead of the multi-hue AVATAR_COLORS above, so a group still reads as visually
// distinct people without leaving the ember palette.
const EMBER_MONO_SHADES = [
  'bg-ember-600 text-white',
  'bg-ember-500 text-white',
  'bg-ember-400 text-ink-deep',
  'bg-ember-300 text-ink-deep',
]

function colorForSeed(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function monoColorForSeed(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return EMBER_MONO_SHADES[Math.abs(hash) % EMBER_MONO_SHADES.length]
}

const SIZE_CLASSES = {
  sm: 'size-8 text-[11px]',
  md: 'size-11 text-sm',
  lg: 'size-16 text-lg',
}

/** Lightweight avatar -- initials from the name, color seeded off a stable id (not the name
    itself, so it doesn't shift if a player edits their display name later).
    `variant="mono"` swaps the per-seed rainbow fill for a seeded shade from the ember ramp, for
    contexts (like the tournament card's avatar stack) where staying on-brand reads better than
    a different hue per person, while still telling people apart. */
export function InitialsAvatar({
  name,
  seed,
  size = 'md',
  variant = 'default',
  className,
}: {
  name: string
  seed: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'mono'
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-bold',
        SIZE_CLASSES[size],
        variant === 'mono' ? monoColorForSeed(seed) : cn('text-white', colorForSeed(seed)),
        className
      )}
    >
      {initials(name)}
    </div>
  )
}
