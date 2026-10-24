import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldError, Label } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { IconToggleGroup, type IconToggleOption } from '@/components/ui/icon-toggle-group'
import { useUpdateMyAthleteProfile } from '@/hooks/use-athletes'
import { extractErrorMessage } from '@/lib/api/client'
import { dominantHandMeta, genderMeta, preferredFormatMeta } from '@/lib/profile-meta'
import type { DominantHand, Gender, MyAthleteProfile, PreferredFormat } from '@/types/api'

const BIO_MAX = 300

function toOptions<T extends string>(meta: Record<T, { label: string; icon: IconToggleOption<T>['icon']; iconClassName?: string }>) {
  return (Object.keys(meta) as T[]).map((value) => ({ value, ...meta[value] }))
}

const genderOptions = toOptions<Gender>(genderMeta)
const dominantHandOptions = toOptions<DominantHand>(dominantHandMeta)
const preferredFormatOptions = toOptions<PreferredFormat>(preferredFormatMeta)

const bioSchema = z.object({
  bio: z.string().max(BIO_MAX, `Keep it under ${BIO_MAX} characters`).optional().or(z.literal('')),
})

export function EditProfileDialog({
  profile,
  open,
  onOpenChange,
}: {
  profile: MyAthleteProfile
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const update = useUpdateMyAthleteProfile()

  // Gender/dominant hand/preferred format are visual toggle groups, not native form inputs, so
  // they're held outside react-hook-form (same reasoning edit-tournament-details-dialog.tsx uses
  // for its Select) and merged in at submit.
  const [gender, setGender] = useState<Gender | null>(profile.gender)
  const [dominantHand, setDominantHand] = useState<DominantHand | null>(profile.dominant_hand)
  const [preferredFormats, setPreferredFormats] = useState<PreferredFormat[]>(profile.preferred_formats)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof bioSchema>>({
    resolver: zodResolver(bioSchema),
    values: { bio: profile.bio ?? '' },
  })

  function resetToProfile() {
    setGender(profile.gender)
    setDominantHand(profile.dominant_hand)
    setPreferredFormats(profile.preferred_formats)
    reset()
  }

  const onSubmit = handleSubmit(({ bio }) => {
    update.mutate(
      { gender, dominant_hand: dominantHand, preferred_formats: preferredFormats, bio: bio || null },
      {
        onSuccess: () => {
          toast.success('Profile updated.')
          onOpenChange(false)
        },
        onError: (err) => toast.error(extractErrorMessage(err)),
      }
    )
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (next) resetToProfile()
        else reset()
      }}
    >
      <DialogContent sheet>
        <DialogHeader>
          <DialogTitle>Edit your profile</DialogTitle>
          <DialogDescription>Shown to opponents and organisers wherever your profile appears.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label id="profile-gender-label">Gender</Label>
            <IconToggleGroup aria-labelledby="profile-gender-label" options={genderOptions} value={gender} onChange={setGender} />
          </div>

          <div className="space-y-1.5">
            <Label id="profile-hand-label">Dominant hand</Label>
            <IconToggleGroup aria-labelledby="profile-hand-label" options={dominantHandOptions} value={dominantHand} onChange={setDominantHand} />
          </div>

          <div className="space-y-1.5">
            <Label id="profile-format-label">Preferred format</Label>
            <IconToggleGroup
              multiple
              aria-labelledby="profile-format-label"
              options={preferredFormatOptions}
              value={preferredFormats}
              onChange={setPreferredFormats}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-bio">Bio</Label>
            <Textarea
              id="profile-bio"
              placeholder="A few words about your game, favourite shot, or what brought you to badminton…"
              maxLength={BIO_MAX}
              {...register('bio')}
            />
            <FieldError>{errors.bio?.message}</FieldError>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={update.isPending}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
