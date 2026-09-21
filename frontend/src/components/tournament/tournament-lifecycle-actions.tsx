import { useState } from 'react'
import { toast } from 'sonner'
import { FlagOff, PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useEndTournament, useStartTournament } from '@/hooks/use-tournaments'
import { extractErrorMessage } from '@/lib/api/client'
import type { TournamentStatus } from '@/types/api'

export function TournamentLifecycleActions({ tournamentId, status }: { tournamentId: string; status: TournamentStatus }) {
  const startTournament = useStartTournament(tournamentId)
  const endTournament = useEndTournament(tournamentId)
  const [confirmEndOpen, setConfirmEndOpen] = useState(false)

  if (status === 'SCHEDULING') {
    return (
      <Button
        size="lg"
        loading={startTournament.isPending}
        onClick={() =>
          startTournament.mutate(undefined, {
            onSuccess: () => toast.success('Tournament is live.'),
            onError: (err) => toast.error(extractErrorMessage(err)),
          })
        }
      >
        <PlayCircle className="size-4" />
        Start tournament
      </Button>
    )
  }

  if (status === 'IN_PROGRESS') {
    return (
      <Dialog open={confirmEndOpen} onOpenChange={setConfirmEndOpen}>
        <DialogTrigger asChild>
          <Button size="lg" variant="outline">
            <FlagOff className="size-4" />
            End tournament
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End this tournament?</DialogTitle>
            <DialogDescription>
              This marks the tournament as completed. Any matches still in progress or scheduled will stay as-is, but the
              tournament can't be reopened afterwards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmEndOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={endTournament.isPending}
              onClick={() =>
                endTournament.mutate(undefined, {
                  onSuccess: () => {
                    toast.success('Tournament completed.')
                    setConfirmEndOpen(false)
                  },
                  onError: (err) => toast.error(extractErrorMessage(err)),
                })
              }
            >
              End tournament
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return null
}
