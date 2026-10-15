import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface IconToggleOption<T extends string> {
  value: T
  label: string
  icon: LucideIcon
  iconClassName?: string
}

interface SingleSelectProps<T extends string> {
  multiple?: false
  value: T | null
  onChange: (value: T | null) => void
}

interface MultiSelectProps<T extends string> {
  multiple: true
  value: T[]
  onChange: (value: T[]) => void
}

type IconToggleGroupProps<T extends string> = {
  options: IconToggleOption<T>[]
  className?: string
} & (SingleSelectProps<T> | MultiSelectProps<T>)

/** A row of icon+label pill buttons, used in place of a dropdown wherever a field has a short,
    visually-distinct set of options (gender, dominant hand, preferred format). Single-select
    mode toggles the active pill off on a second click -- there's no separate "Not set" row like
    a `Select` would have, so that's the only way to clear it. */
export function IconToggleGroup<T extends string>(props: IconToggleGroupProps<T>) {
  const { options, className } = props

  function isActive(value: T): boolean {
    return props.multiple ? props.value.includes(value) : props.value === value
  }

  function toggle(value: T) {
    if (props.multiple) {
      const next = props.value.includes(value) ? props.value.filter((v) => v !== value) : [...props.value, value]
      props.onChange(next)
    } else {
      props.onChange(props.value === value ? null : value)
    }
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {options.map((opt) => {
        const active = isActive(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(opt.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-ember-500 bg-ember-500/15 text-ember-400'
                : 'border-white/20 bg-transparent text-court-cream/70 hover:bg-white/5'
            )}
          >
            <opt.icon className={cn('size-4', opt.iconClassName)} />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
