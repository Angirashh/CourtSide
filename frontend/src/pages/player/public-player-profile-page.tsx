import { useParams } from 'react-router-dom'
import { MapPin, UserX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { InitialsAvatar } from '@/components/ui/avatar'
import { CareerStatsSection } from '@/components/player/career-stats-section'
import { usePublicAthleteProfile } from '@/hooks/use-athletes'
import { dominantHandMeta, genderMeta, preferredFormatMeta } from '@/lib/profile-meta'
import { cn } from '@/lib/utils'

export function PublicPlayerProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { data: profile, isLoading, isError } = usePublicAthleteProfile(id)

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-8 py-6">
        <div className="h-24 rounded-2xl shimmer-bg" />
        <div className="h-44 rounded-2xl shimmer-bg" />
      </div>
    )
  }

  if (isError || !profile) {
    return (
      <div className="mx-auto max-w-3xl py-6">
        <EmptyState icon={UserX} title="Athlete not found" description="This profile doesn't exist or may have been removed." />
      </div>
    )
  }

  const completedHistory = profile.history.filter((h) => h.tournament_status === 'COMPLETED')
  const genderInfo = profile.gender ? genderMeta[profile.gender] : null
  const handInfo = profile.dominant_hand ? dominantHandMeta[profile.dominant_hand] : null
  const hasAnyInfo = !!genderInfo || !!handInfo || profile.preferred_formats.length > 0

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <InitialsAvatar name={profile.name} seed={profile.id} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl tracking-tight text-court-cream">{profile.name}</h1>
            {profile.club_or_city && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-court-cream/55">
                <MapPin className="size-3.5" /> {profile.club_or_city}
              </p>
            )}
          </div>
        </div>

        {hasAnyInfo && (
          <div className="mt-4 flex flex-wrap gap-2">
            {genderInfo && (
              <Badge variant="outline" className="gap-1.5">
                <genderInfo.icon className="size-3" /> {genderInfo.label}
              </Badge>
            )}
            {handInfo && (
              <Badge variant="outline" className="gap-1.5">
                <handInfo.icon className={cn('size-3', handInfo.iconClassName)} /> {handInfo.label}
              </Badge>
            )}
            {profile.preferred_formats.map((format) => {
              const meta = preferredFormatMeta[format]
              return (
                <Badge key={format} variant="outline" className="gap-1.5">
                  <meta.icon className="size-3" /> {meta.label}
                </Badge>
              )
            })}
          </div>
        )}

        {profile.bio && <p className="mt-4 text-sm leading-relaxed text-court-cream/70">{profile.bio}</p>}
      </Card>

      {profile.tournaments_played > 0 && <CareerStatsSection stats={profile} history={completedHistory} />}
    </div>
  )
}
