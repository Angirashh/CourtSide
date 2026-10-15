import { Pencil, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { dominantHandMeta, genderMeta, preferredFormatMeta } from '@/lib/profile-meta'
import type { MyAthleteProfile } from '@/types/api'

/** The read-only chip row shown below the player's name once they've saved any profile info --
    or, if nothing's been filled in yet (first login, or just never got around to it), a nudge
    to go fill it in instead of an empty row. */
export function ProfileSummary({ profile, onEdit }: { profile: MyAthleteProfile; onEdit: () => void }) {
  const hasAnyInfo = !!profile.gender || !!profile.dominant_hand || profile.preferred_formats.length > 0 || !!profile.bio

  if (!hasAnyInfo) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-3">
        <p className="flex items-center gap-2 text-sm text-court-cream/70">
          <Sparkles className="size-4 shrink-0 text-ember-500" />
          Tell opponents and organisers a bit about your game.
        </p>
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="size-3.5" /> Add profile info
        </Button>
      </div>
    )
  }

  const genderInfo = profile.gender ? genderMeta[profile.gender] : null
  const handInfo = profile.dominant_hand ? dominantHandMeta[profile.dominant_hand] : null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {genderInfo && (
          <Badge variant="outline" className="gap-1.5">
            <genderInfo.icon className="size-3.5" /> {genderInfo.label}
          </Badge>
        )}
        {handInfo && (
          <Badge variant="outline" className="gap-1.5">
            <handInfo.icon className={cn('size-3.5', handInfo.iconClassName)} /> {handInfo.label}
          </Badge>
        )}
        {profile.preferred_formats.map((format) => {
          const meta = preferredFormatMeta[format]
          return (
            <Badge key={format} variant="outline" className="gap-1.5">
              <meta.icon className="size-3.5" /> {meta.label}
            </Badge>
          )
        })}
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-full bg-ember-500/15 px-2.5 py-1 text-xs font-semibold leading-none text-ember-400 transition-colors hover:bg-ember-500/25"
          title="Edit profile"
          aria-label="Edit profile"
        >
          <Pencil className="size-3.5" /> Edit
        </button>
      </div>
      {profile.bio && <p className="text-sm leading-relaxed text-court-cream/70">{profile.bio}</p>}
    </div>
  )
}
