import { cn } from '@/lib/utils'

/** Court illustration, sat behind a dark section as a faint watermark. `mix-blend-luminosity`
 * drops the source image's own hue/saturation and keeps only its luminosity, so it renders in
 * the dark section's own navy tone instead of showing up as a colorful green patch; the radial
 * mask fades all four edges so it reads as a soft bleed rather than a pasted rectangle. */
export function BadmintonWatermark({ className }: { className?: string }) {
  return (
    <img
      src="/images/shuttlecock-illustration.png"
      alt=""
      aria-hidden="true"
      className={cn('pointer-events-none absolute select-none object-cover opacity-30 mix-blend-luminosity', className)}
      style={{
        maskImage: 'radial-gradient(ellipse at 65% 45%, black 0%, transparent 72%)',
        WebkitMaskImage: 'radial-gradient(ellipse at 65% 45%, black 0%, transparent 72%)',
      }}
    />
  )
}
