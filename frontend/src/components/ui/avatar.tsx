import { cn, initials } from '@/lib/utils'

const AVATAR_COLORS = ['bg-ember-500', 'bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500']

function colorForSeed(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

const SIZE_CLASSES = {
  sm: 'size-8 text-[11px]',
  md: 'size-11 text-sm',
  lg: 'size-16 text-lg',
}

/** Lightweight avatar -- initials from the name, color seeded off a stable id (not the name
    itself, so it doesn't shift if a player edits their display name later). */
export function InitialsAvatar({
  name,
  seed,
  size = 'md',
  className,
}: {
  name: string
  seed: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-bold text-white',
        SIZE_CLASSES[size],
        colorForSeed(seed),
        className
      )}
    >
      {initials(name)}
    </div>
  )
}
