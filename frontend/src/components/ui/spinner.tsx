import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-ember-500', className)} />
}

export function FullPageSpinner() {
  return (
    <div className="flex h-[60svh] w-full items-center justify-center">
      <Spinner className="size-8" />
    </div>
  )
}
