import * as React from 'react'
import { cn } from '@/lib/utils'

// Base pulsing placeholder block -- lighter than the dark card it sits on, so it reads as
// "content is on its way" rather than just a blank hole. Compose these into shapes that mirror
// the real content (a line for a title, a circle for an avatar, etc.) rather than one flat slab.
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-white/10', className)} {...props} />
}

export function SkeletonCircle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <Skeleton className={cn('rounded-full', className)} {...props} />
}

export function SkeletonText({
  lines = 1,
  className,
  lastLineWidth = '60%',
}: {
  lines?: number
  className?: string
  lastLineWidth?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3" style={i === lines - 1 && lines > 1 ? { width: lastLineWidth } : undefined} />
      ))}
    </div>
  )
}

// Dark card shell, same surface as the real `Card` component -- the pulsing Skeleton pieces go
// inside it as children, shaped to whatever the loaded card will actually show.
export function SkeletonCard({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border border-white/10 bg-ink-card p-5 shadow-md', className)} {...props}>
      {children}
    </div>
  )
}
