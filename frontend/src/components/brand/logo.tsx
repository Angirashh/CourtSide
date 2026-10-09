import { LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The one mark used everywhere -- sharp square, no radius, per the Match Point brand
 * (see frontend_design_philosophy: sharp corners everywhere, no rounded chrome).
 */
export function BrandMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center bg-ember-500 text-ink shadow-sm', className)}
      style={{ width: size, height: size }}
    >
      <LayoutGrid size={Math.round(size * 0.5)} strokeWidth={2.5} />
    </div>
  )
}

/** The two-tone "Court" + ember "side" wordmark, text size/color left to the caller. */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-display uppercase leading-none tracking-wide', className)}>
      Court<span className="text-ember-500">side</span>
    </span>
  )
}

/** Full logo lockup: mark + wordmark, side by side. */
export function Logo({
  size = 36,
  textClassName,
  className,
}: {
  size?: number
  textClassName?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandMark size={size} />
      <BrandWordmark className={cn('text-xl', textClassName)} />
    </div>
  )
}
