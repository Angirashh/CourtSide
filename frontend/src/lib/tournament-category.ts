import { Baby, Briefcase, GraduationCap, Handshake } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TournamentCategory } from '@/types/api'

export const categoryMeta: Record<TournamentCategory, { label: string; icon: LucideIcon }> = {
  CORPORATE: { label: 'Corporate', icon: Briefcase },
  COLLEGE: { label: 'College', icon: GraduationCap },
  JUNIOR: { label: 'Juniors', icon: Baby },
  FRIENDLY: { label: 'Friendly', icon: Handshake },
}
