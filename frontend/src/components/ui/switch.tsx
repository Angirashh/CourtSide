import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-white/15 bg-white/15 transition-colors',
      'data-[state=checked]:border-ember-500 data-[state=checked]:bg-ember-500',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block size-5 translate-x-0.5 rounded-full bg-court-cream shadow-sm transition-transform',
        'data-[state=checked]:translate-x-[22px]'
      )}
    />
  </SwitchPrimitive.Root>
))
Switch.displayName = 'Switch'
