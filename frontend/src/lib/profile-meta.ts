import type { LucideIcon } from 'lucide-react'
import { Hand, Mars, User, Users, UsersRound, Venus, VenusAndMars } from 'lucide-react'
import type { DominantHand, Gender, PreferredFormat } from '@/types/api'

/** Shared icon+label vocabulary for the profile fields -- used by the edit dialog's toggle
    groups, the read-only summary on the player's own page, and the public profile page, so the
    same icon always means the same thing everywhere it shows up. */
export const genderMeta: Record<Gender, { label: string; icon: LucideIcon }> = {
  MALE: { label: 'Male', icon: Mars },
  FEMALE: { label: 'Female', icon: Venus },
  PREFER_NOT_TO_SAY: { label: 'Prefer not to say', icon: VenusAndMars },
}

export const dominantHandMeta: Record<DominantHand, { label: string; icon: LucideIcon; iconClassName?: string }> = {
  RIGHT: { label: 'Right-handed', icon: Hand },
  LEFT: { label: 'Left-handed', icon: Hand, iconClassName: '-scale-x-100' },
}

export const preferredFormatMeta: Record<PreferredFormat, { label: string; icon: LucideIcon }> = {
  SINGLES: { label: 'Singles', icon: User },
  DOUBLES: { label: 'Doubles', icon: Users },
  MIXED_DOUBLES: { label: 'Mixed doubles', icon: UsersRound },
}
