import { cn } from '@/lib/utils'

/** The leaping jump-smash player icon (no lettering -- pairs with BrandWordmark's text). `size`
 * sets the rendered height; width follows the artwork's own (non-square) aspect ratio. */
export function BrandMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/images/brand/cs-figure.svg"
      alt=""
      className={cn('shrink-0 object-contain', className)}
      style={{ height: size, width: 'auto', aspectRatio: '972 / 1000' }}
    />
  )
}

/** The two-tone "COURT" + ember "SIDE" wordmark, as artwork (not live text) so it always
 * matches the figure logo's exact lettering. `size` sets the rendered height; width follows
 * the artwork's own (non-square) aspect ratio. */
export function BrandWordmark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/images/brand/courtside-wordmark-text.svg"
      alt="Courtside"
      className={cn('shrink-0 object-contain', className)}
      style={{ height: size, width: 'auto', aspectRatio: '1820 / 286' }}
    />
  )
}

/** A large, faint copy of the figure icon meant to sit behind a BrandWordmark as a subtle
 * background texture -- decorative only. The caller must give its parent `position: relative`
 * (or `relative` class) so this absolute layer positions against it, not the page. */
export function BrandWatermark({ size = 120, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/images/brand/cs-figure.svg"
      alt=""
      aria-hidden="true"
      className={cn('pointer-events-none absolute -z-10 opacity-[0.14]', className)}
      style={{ height: size, width: 'auto', aspectRatio: '972 / 1000' }}
    />
  )
}
