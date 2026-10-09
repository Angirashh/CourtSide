import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root

export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full bg-white/10 p-1 overflow-x-auto no-scrollbar',
        className
      )}
      {...props}
    />
  )
}

export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold text-court-cream/55 transition-all',
        'hover:text-court-cream/85',
        'data-[state=active]:bg-navy-900 data-[state=active]:text-cream-50 data-[state=active]:shadow-sm',
        className
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('mt-5 focus-visible:outline-none animate-fade-up', className)}
      {...props}
    />
  )
}
