import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary:
          'bg-ember-500 text-navy-950 shadow-sm shadow-ember-500/30 hover:bg-ember-400 focus-visible:ring-ember-500',
        dark: 'bg-navy-900 text-cream-50 shadow-sm hover:bg-navy-800 focus-visible:ring-navy-700',
        outline:
          'border border-navy-200 bg-transparent text-navy-900 hover:bg-navy-100/60 focus-visible:ring-navy-400',
        ghost: 'text-navy-700 hover:bg-navy-900/5 focus-visible:ring-navy-300',
        danger: 'bg-danger text-cream-50 hover:bg-danger/90 focus-visible:ring-danger',
        link: 'text-ember-600 underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        sm: 'h-10 px-3.5 text-xs sm:h-8 sm:px-3',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10 shrink-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    // Slot requires exactly one child, so asChild (e.g. wrapping a <Link>) skips the loader slot entirely.
    if (asChild) {
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
          {children}
        </Slot>
      )
    }
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="size-4 animate-spin" />}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
