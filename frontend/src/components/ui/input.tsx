import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          'flex h-11 w-full rounded-lg border border-white/20 bg-ink-card px-3.5 text-base text-court-cream sm:text-sm placeholder:text-court-cream/45 shadow-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500/40 focus-visible:border-ember-500',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export const PhoneInput = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>>(
  ({ className, onChange, ...props }, ref) => {
    return (
      <div
        className={cn(
          'flex h-11 w-full items-stretch overflow-hidden rounded-lg border border-white/20 bg-ink-card shadow-sm transition-colors',
          'has-[input:focus-visible]:border-ember-500 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ember-500/40'
        )}
      >
        <span className="flex select-none items-center border-r border-white/20 bg-navy-800 px-3 text-sm font-medium text-court-cream/60">
          +91
        </span>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={10}
          placeholder="98765 43210"
          ref={ref}
          className={cn(
            'min-w-0 flex-1 bg-transparent px-3.5 text-base text-court-cream sm:text-sm placeholder:text-court-cream/45',
            'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          onChange={(e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10)
            onChange?.(e)
          }}
          {...props}
        />
      </div>
    )
  }
)
PhoneInput.displayName = 'PhoneInput'

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('text-sm font-medium text-court-cream/85', className)} {...props} />
  )
)
Label.displayName = 'Label'

export function FieldError({ children }: { children?: string }) {
  if (!children) return null
  return <p className="text-xs font-medium text-danger">{children}</p>
}
