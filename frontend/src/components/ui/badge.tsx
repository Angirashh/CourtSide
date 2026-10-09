import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold leading-none',
  {
    variants: {
      variant: {
        neutral: 'bg-white/10 text-court-cream/70',
        dark: 'bg-navy-900 text-cream-100',
        ember: 'bg-ember-500/15 text-ember-400',
        success: 'bg-success-bg text-success',
        danger: 'bg-danger-bg text-danger',
        warning: 'bg-warning-bg text-warning',
        outline: 'border border-white/20 text-court-cream/60',
      },
    },
    defaultVariants: { variant: 'neutral' },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean
  /** Recording-style pulsing dot (expanding ring), for genuinely live/on-court states. */
  pulse?: boolean
}

export function Badge({ className, variant, dot, pulse, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {pulse ? (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      ) : (
        dot && <span className="size-1.5 rounded-full bg-current" />
      )}
      {children}
    </span>
  )
}
