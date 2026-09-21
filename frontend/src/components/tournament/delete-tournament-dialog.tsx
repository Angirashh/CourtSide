import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useDeleteTournament } from '@/hooks/use-tournaments'
import { extractErrorMessage } from '@/lib/api/client'
import type { TournamentStatus } from '@/types/api'

export function DeleteTournamentDialog({ tournamentId, name, status }: { tournamentId: string; name: string; status: TournamentStatus }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const deleteTournament = useDeleteTournament(tournamentId)

  const warning =
    status === 'IN_PROGRESS'
      ? 'This tournament is live. Deleting it removes it from the public site right now, along with every match result.'
      : status === 'COMPLETED'
        ? 'This removes the tournament and all of its results, including from the public site.'
        : 'This removes the tournament, its players, courts and any generated schedule.'

  function handleDelete() {
    deleteTournament.mutate(undefined, {
      onSuccess: () => {
        toast.success(`"${name}" deleted.`)
        setOpen(false)
        navigate('/organiser')
      },
      onError: (err) => toast.error(extractErrorMessage(err)),
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" variant="outline" className="text-danger hover:bg-danger-bg">
          <Trash2 className="size-4" />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete "{name}"?</DialogTitle>
          <DialogDescription>{warning} This can't be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={deleteTournament.isPending} onClick={handleDelete}>
            Delete tournament
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
