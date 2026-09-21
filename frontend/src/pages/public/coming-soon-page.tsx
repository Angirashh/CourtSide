import { Link } from 'react-router-dom'
import { ArrowRight, UserRound } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'

export function ComingSoonPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <EmptyState
        icon={UserRound}
        title={title}
        description={description}
        action={
          <Button asChild variant="outline">
            <Link to="/tournaments">
              Browse tournaments <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        }
      />
    </div>
  )
}
