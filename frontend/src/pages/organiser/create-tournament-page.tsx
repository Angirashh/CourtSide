import { Children, cloneElement, isValidElement, useId, useState } from 'react'
import { useBeforeUnload, useBlocker, useNavigate } from 'react-router-dom'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Baby, Briefcase, Check, Clock, GraduationCap, Handshake, MapPin, Plus, Trash2, Trophy, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCreateTournament } from '@/hooks/use-tournaments'
import { extractErrorMessage } from '@/lib/api/client'
import { cn } from '@/lib/utils'

const schema = z.object({
  name: z.string().min(3, 'Give your tournament a name'),
  tournament_type: z.enum(['INDIVIDUAL', 'TEAM']),
  format: z.enum(['GROUP_KNOCKOUT', 'SWISS_KNOCKOUT', 'KNOCKOUT', 'TEAM_FRIENDLY']),
  legacy_team_friendly: z.boolean(),
  event_selection: z.enum(['singles', 'doubles', 'both']),
  singles_format: z.enum(['GROUP_KNOCKOUT', 'SWISS_KNOCKOUT', 'KNOCKOUT']),
  doubles_format: z.enum(['GROUP_KNOCKOUT', 'SWISS_KNOCKOUT', 'KNOCKOUT']),
  singles_matches: z.number().min(0).max(30),
  doubles_matches: z.number().min(0).max(30),
  mixed_doubles_matches: z.number().min(0).max(30),
  max_singles_per_player: z.number().min(0).max(30),
  max_doubles_per_player: z.number().min(0).max(30),
  max_mixed_doubles_per_player: z.number().min(0).max(30),
  match_order: z.array(z.enum(['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'])),
  completion_mode: z.enum(['MAJORITY', 'PLAY_ALL']),
  category: z.enum(['CORPORATE', 'COLLEGE', 'JUNIOR', 'FRIENDLY']),
  venue: z.string().min(2, 'Add a venue'),
  venue_link: z.string().trim().url('Enter a valid URL (starting with https://)').optional().or(z.literal('')),
  tournament_date: z.string().min(1, 'Pick a date'),
  match_duration_minutes: z.coerce.number().min(10).max(180),
  rest_time_minutes: z.coerce.number().min(0).max(120),
  shuttle_cost: z.coerce.number().min(0),
  shuttle_matches_per_unit: z.coerce.number().min(1),
  courts: z
    .array(
      z.object({
        name: z.string().min(1, 'Name required'),
        hourly_rate: z.coerce.number().min(0),
      })
    )
    .min(1, 'Add at least one court'),
}).superRefine((values, ctx) => {
  if (values.tournament_type === 'TEAM') {
    if (values.singles_matches + values.doubles_matches + values.mixed_doubles_matches < 1) {
      ctx.addIssue({ code: 'custom', path: ['singles_matches'], message: 'Add at least one singles, doubles, or mixed doubles match.' })
    }
    if (values.match_order.filter((v) => v === 'SINGLES').length !== values.singles_matches ||
        values.match_order.filter((v) => v === 'DOUBLES').length !== values.doubles_matches ||
        values.match_order.filter((v) => v === 'MIXED_DOUBLES').length !== values.mixed_doubles_matches) {
      ctx.addIssue({ code: 'custom', path: ['match_order'], message: 'Match order must include every configured match.' })
    }
    if ((values.singles_matches > 0 && (values.max_singles_per_player < 1 || values.max_singles_per_player > values.singles_matches)) ||
        (values.doubles_matches > 0 && (values.max_doubles_per_player < 1 || values.max_doubles_per_player > values.doubles_matches)) ||
        (values.mixed_doubles_matches > 0 && (values.max_mixed_doubles_per_player < 1 || values.max_mixed_doubles_per_player > values.mixed_doubles_matches))) {
      ctx.addIssue({ code: 'custom', path: ['max_singles_per_player'], message: 'Set per-player limits no greater than the configured match counts.' })
    }
  }
})

type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

const steps = ['Format', 'Timing', 'Courts'] as const

export function CreateTournamentPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const createTournament = useCreateTournament()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    control,
    trigger,
    formState: { errors, isDirty },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      tournament_type: 'INDIVIDUAL',
      format: 'GROUP_KNOCKOUT',
      legacy_team_friendly: false,
      event_selection: 'singles',
      singles_format: 'GROUP_KNOCKOUT',
      doubles_format: 'GROUP_KNOCKOUT',
      singles_matches: 3,
      doubles_matches: 2,
      mixed_doubles_matches: 0,
      max_singles_per_player: 1,
      max_doubles_per_player: 1,
      max_mixed_doubles_per_player: 0,
      match_order: ['SINGLES', 'DOUBLES', 'SINGLES', 'DOUBLES', 'SINGLES'],
      completion_mode: 'MAJORITY',
      category: 'CORPORATE',
      venue: '',
      venue_link: '',
      tournament_date: '',
      match_duration_minutes: 15,
      rest_time_minutes: 10,
      shuttle_cost: 220,
      shuttle_matches_per_unit: 3,
      courts: [{ name: 'Court 1', hourly_rate: 300 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'courts' })
  const [submitted, setSubmitted] = useState(false)
  const hasUnsavedChanges = isDirty && !submitted

  // In-app navigation (sidebar, back link) is blocked with a confirm; a tab close/reload
  // goes through the browser's own native prompt instead, via useBeforeUnload below.
  useBlocker(({ currentLocation, nextLocation }) => {
    if (!hasUnsavedChanges || currentLocation.pathname === nextLocation.pathname) return false
    return !window.confirm('Leave this page? Your tournament details won’t be saved.')
  })
  useBeforeUnload((event) => {
    if (!hasUnsavedChanges) return
    event.preventDefault()
  })

  const format = watch('format')
  const tournamentType = watch('tournament_type')
  const legacyTeamFriendly = watch('legacy_team_friendly')
  const eventSelection = watch('event_selection')
  const matchOrder = watch('match_order')
  const category = watch('category')

  function syncTeamMatchOrder(singlesMatches: number, doublesMatches: number, mixedDoublesMatches: number) {
    const remaining = { SINGLES: singlesMatches, DOUBLES: doublesMatches, MIXED_DOUBLES: mixedDoublesMatches }
    const order: ('SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES')[] = []
    for (const slot of getValues('match_order')) {
      if (remaining[slot] > 0) {
        order.push(slot)
        remaining[slot] -= 1
      }
    }
    for (let i = 0; i < remaining.SINGLES; i += 1) order.push('SINGLES')
    for (let i = 0; i < remaining.DOUBLES; i += 1) order.push('DOUBLES')
    for (let i = 0; i < remaining.MIXED_DOUBLES; i += 1) order.push('MIXED_DOUBLES')
    setValue('match_order', order, { shouldValidate: true })
  }

  async function goNext() {
    const fieldsToValidate: (keyof FormInput)[][] = [
      ['name', 'format', 'category', 'venue', 'venue_link', 'tournament_date'],
      ['match_duration_minutes', 'rest_time_minutes', 'shuttle_cost', 'shuttle_matches_per_unit'],
      ['courts'],
    ]
    const valid = await trigger(fieldsToValidate[step])
    if (valid) setStep((s) => Math.min(s + 1, steps.length - 1))
  }

  const onSubmit = handleSubmit((values) => {
    const eventFormats = values.tournament_type === 'INDIVIDUAL' && !values.legacy_team_friendly
      ? {
          ...(values.event_selection !== 'doubles' ? { singles: values.singles_format } : {}),
          ...(values.event_selection !== 'singles' ? { doubles: values.doubles_format } : {}),
        }
      : undefined
    const primaryFormat = values.tournament_type === 'TEAM'
      ? values.format === 'TEAM_FRIENDLY' ? 'GROUP_KNOCKOUT' : values.format
      : values.legacy_team_friendly ? 'TEAM_FRIENDLY' : eventFormats?.singles ?? eventFormats?.doubles ?? 'GROUP_KNOCKOUT'
    const teamConfig = values.tournament_type === 'TEAM'
      ? {
          singles_matches: values.singles_matches,
          doubles_matches: values.doubles_matches,
          mixed_doubles_matches: values.mixed_doubles_matches,
          max_singles_per_player: values.max_singles_per_player,
          max_doubles_per_player: values.max_doubles_per_player,
          max_mixed_doubles_per_player: values.max_mixed_doubles_per_player,
          match_order: values.match_order,
          completion_mode: values.completion_mode,
        }
      : undefined
    createTournament.mutate(
      {
        name: values.name,
        tournament_type: values.tournament_type,
        format: primaryFormat,
        event_formats: eventFormats,
        team_config: teamConfig,
        category: values.category,
        venue: values.venue,
        venue_link: values.venue_link || undefined,
        tournament_date: values.tournament_date,
        match_duration_minutes: values.match_duration_minutes,
        rest_time_minutes: values.rest_time_minutes,
        shuttle_cost: values.shuttle_cost,
        shuttle_matches_per_unit: values.shuttle_matches_per_unit,
        courts: values.courts,
      },
      {
        onSuccess: (tournament) => {
          setSubmitted(true)
          toast.success('Tournament created — now build your roster.')
          navigate(`/organiser/${tournament.id}`)
        },
        onError: (err) => toast.error(extractErrorMessage(err)),
      }
    )
  })

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-court-cream sm:text-3xl">Create a tournament</h1>
        <p className="mt-1 text-sm text-court-cream/55">Three quick steps, then straight to your roster.</p>
      </div>

      <Stepper current={step} />

      <form onSubmit={onSubmit}>
        <Card>
          <CardContent className="pt-6">
            <AnimatePresence mode="wait" initial={false}>
              {step === 0 && (
                <StepPanel key="format">
                  <FieldGroup label="Tournament name">
                    <Input placeholder="City Open Badminton Championship 2026" {...register('name')} />
                    <FieldError>{errors.name?.message}</FieldError>
                  </FieldGroup>

                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <FieldGroup label="Venue">
                      <Input placeholder="Koramangala Indoor Stadium" {...register('venue')} />
                      <FieldError>{errors.venue?.message}</FieldError>
                    </FieldGroup>
                    <FieldGroup label="Date">
                      <Input type="date" {...register('tournament_date')} />
                      <FieldError>{errors.tournament_date?.message}</FieldError>
                    </FieldGroup>
                  </div>

                  <FieldGroup label="Venue link (optional)">
                    <Input type="url" placeholder="https://maps.google.com/?q=…" {...register('venue_link')} />
                    <FieldError>{errors.venue_link?.message}</FieldError>
                  </FieldGroup>

                  <FieldGroup label="Tournament type">
                    <Tabs
                      value={tournamentType}
                      onValueChange={(value) => {
                        setValue('tournament_type', value as 'INDIVIDUAL' | 'TEAM')
                        if (value === 'TEAM' && format === 'TEAM_FRIENDLY') setValue('format', 'GROUP_KNOCKOUT')
                      }}
                    >
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="INDIVIDUAL">Individual</TabsTrigger>
                        <TabsTrigger value="TEAM">Team</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <p className="text-xs text-court-cream/50">
                      {tournamentType === 'TEAM'
                        ? 'Create teams and set the matches played in each tie.'
                        : 'Choose singles, doubles, or both as separate events.'}
                    </p>
                  </FieldGroup>

                  {tournamentType === 'INDIVIDUAL' ? (
                    <div className="space-y-4">
                      {!legacyTeamFriendly ? (
                        <>
                          <FieldGroup label="Events">
                            <Tabs
                              value={eventSelection}
                              onValueChange={(value) => setValue('event_selection', value as 'singles' | 'doubles' | 'both')}
                            >
                              <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="singles">Singles</TabsTrigger>
                                <TabsTrigger value="doubles">Doubles</TabsTrigger>
                                <TabsTrigger value="both">Both</TabsTrigger>
                              </TabsList>
                            </Tabs>
                          </FieldGroup>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {eventSelection !== 'doubles' && (
                              <FormatSelect label="Singles format" value={watch('singles_format')} onChange={(v) => setValue('singles_format', v)} />
                            )}
                            {eventSelection !== 'singles' && (
                              <FormatSelect label="Doubles format" value={watch('doubles_format')} onChange={(v) => setValue('doubles_format', v)} />
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-court-cream/65">Team Friendly uses its existing crossover singles setup.</p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                        <Button
                          type="button"
                          size="sm"
                          variant={legacyTeamFriendly ? 'primary' : 'outline'}
                          onClick={() => setValue('legacy_team_friendly', !legacyTeamFriendly)}
                        >
                          {legacyTeamFriendly && <Check className="size-3.5" />}
                          Team Friendly
                        </Button>
                        <p className="text-xs text-court-cream/50">Existing two-side cross-team singles format</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <FormatSelect label="Team competition format" value={format === 'SWISS_KNOCKOUT' || format === 'KNOCKOUT' ? format : 'GROUP_KNOCKOUT'} onChange={(value) => setValue('format', value)} />

                      <div className="grid gap-3 sm:grid-cols-2">
                        <NumberField
                          label="Singles matches per tie"
                          value={watch('singles_matches')}
                          onChange={(value) => {
                            setValue('singles_matches', value, { shouldValidate: true })
                            setValue('max_singles_per_player', Math.min(watch('max_singles_per_player'), value), { shouldValidate: true })
                            syncTeamMatchOrder(value, watch('doubles_matches'), watch('mixed_doubles_matches'))
                          }}
                        />
                        <NumberField
                          label="Doubles matches per tie"
                          value={watch('doubles_matches')}
                          onChange={(value) => {
                            setValue('doubles_matches', value, { shouldValidate: true })
                            setValue('max_doubles_per_player', Math.min(watch('max_doubles_per_player'), value), { shouldValidate: true })
                            syncTeamMatchOrder(watch('singles_matches'), value, watch('mixed_doubles_matches'))
                          }}
                        />
                        <NumberField
                          label="Mixed doubles matches per tie"
                          value={watch('mixed_doubles_matches')}
                          onChange={(value) => {
                            setValue('mixed_doubles_matches', value, { shouldValidate: true })
                            setValue('max_mixed_doubles_per_player', Math.min(watch('max_mixed_doubles_per_player'), value), { shouldValidate: true })
                            syncTeamMatchOrder(watch('singles_matches'), watch('doubles_matches'), value)
                          }}
                        />
                        {watch('singles_matches') > 0 && (
                          <NumberField
                            label="Max singles per player, per tie"
                            value={watch('max_singles_per_player')}
                            onChange={(value) => setValue('max_singles_per_player', value, { shouldValidate: true })}
                          />
                        )}
                        {watch('doubles_matches') > 0 && (
                          <NumberField
                            label="Max doubles per player, per tie"
                            value={watch('max_doubles_per_player')}
                            onChange={(value) => setValue('max_doubles_per_player', value, { shouldValidate: true })}
                          />
                        )}
                        {watch('mixed_doubles_matches') > 0 && (
                          <NumberField
                            label="Max mixed doubles per player, per tie"
                            value={watch('max_mixed_doubles_per_player')}
                            onChange={(value) => setValue('max_mixed_doubles_per_player', value, { shouldValidate: true })}
                          />
                        )}
                      </div>
                      <FieldError>{errors.match_order?.message || errors.singles_matches?.message || errors.doubles_matches?.message || errors.mixed_doubles_matches?.message || errors.max_singles_per_player?.message || errors.max_doubles_per_player?.message || errors.max_mixed_doubles_per_player?.message}</FieldError>
                      <MatchOrderEditor
                        order={matchOrder}
                        onReorder={(order) => setValue('match_order', order, { shouldValidate: true })}
                      />
                      <FieldGroup label="Tie length">
                        <Tabs value={watch('completion_mode')} onValueChange={(value) => setValue('completion_mode', value as 'MAJORITY' | 'PLAY_ALL')}>
                          <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="MAJORITY">Finish at majority</TabsTrigger>
                            <TabsTrigger value="PLAY_ALL">Play all games</TabsTrigger>
                          </TabsList>
                        </Tabs>
                        <p className="text-xs text-court-cream/50">
                          {watch('completion_mode') === 'MAJORITY'
                            ? 'Stop once the remaining games cannot change the tie winner.'
                            : 'Play every configured game before deciding the tie.'}
                        </p>
                      </FieldGroup>
                    </div>
                  )}

                  <FieldGroup label="Category">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <CategoryOption
                        icon={Briefcase}
                        active={category === 'CORPORATE'}
                        title="Corporate"
                        onClick={() => setValue('category', 'CORPORATE')}
                      />
                      <CategoryOption
                        icon={GraduationCap}
                        active={category === 'COLLEGE'}
                        title="College"
                        onClick={() => setValue('category', 'COLLEGE')}
                      />
                      <CategoryOption
                        icon={Baby}
                        active={category === 'JUNIOR'}
                        title="Juniors"
                        onClick={() => setValue('category', 'JUNIOR')}
                      />
                      <CategoryOption
                        icon={Handshake}
                        active={category === 'FRIENDLY'}
                        title="Friendly"
                        onClick={() => setValue('category', 'FRIENDLY')}
                      />
                    </div>
                  </FieldGroup>
                </StepPanel>
              )}

              {step === 1 && (
                <StepPanel key="timing">
                  <FieldGroup label="Average minutes per match">
                    <Input type="number" min={10} {...register('match_duration_minutes')} />
                    <FieldError>{errors.match_duration_minutes?.message}</FieldError>
                  </FieldGroup>
                  <FieldGroup label="Minimum rest between a player's matches (minutes)">
                    <Input type="number" min={0} {...register('rest_time_minutes')} />
                    <FieldError>{errors.rest_time_minutes?.message}</FieldError>
                  </FieldGroup>
                  <p className="rounded-lg bg-white/10 px-3.5 py-3 text-xs leading-relaxed text-court-cream/60">
                    These feed the court-scheduling solver directly — it uses them to keep the whole event as short as
                    possible while never double-booking a court or a player.
                  </p>

                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <FieldGroup label="Cost per shuttle (₹)">
                      <Input type="number" min={0} {...register('shuttle_cost')} />
                      <FieldError>{errors.shuttle_cost?.message}</FieldError>
                    </FieldGroup>
                    <FieldGroup label="Matches per shuttle">
                      <Input type="number" min={1} {...register('shuttle_matches_per_unit')} />
                      <FieldError>{errors.shuttle_matches_per_unit?.message}</FieldError>
                    </FieldGroup>
                  </div>
                  <p className="rounded-lg bg-white/10 px-3.5 py-3 text-xs leading-relaxed text-court-cream/60">
                    Used to estimate total shuttle spend and cost per player alongside court costs, once matches are
                    scheduled.
                  </p>
                </StepPanel>
              )}

              {step === 2 && (
                <StepPanel key="courts">
                  <FieldGroup label="Courts available">
                    <div className="space-y-2.5">
                      {fields.map((field, idx) => (
                        <div key={field.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 sm:flex">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-court-cream/55">
                            <MapPin className="size-4" />
                          </div>
                          <Input placeholder="Court name" {...register(`courts.${idx}.name` as const)} />
                          <div className="relative col-start-2 row-start-2 sm:w-32 sm:shrink-0">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-court-cream/45">
                              ₹/hr
                            </span>
                            <Input
                              type="number"
                              min={0}
                              className="pl-11"
                              {...register(`courts.${idx}.hourly_rate` as const)}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => remove(idx)}
                            disabled={fields.length === 1}
                            aria-label={`Remove court ${idx + 1}`}
                            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-court-cream/45 transition-colors hover:bg-danger-bg hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500 disabled:opacity-30"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <FieldError>{errors.courts?.message}</FieldError>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => append({ name: `Court ${fields.length + 1}`, hourly_rate: 300 })}
                    >
                      <Plus className="size-3.5" />
                      Add court
                    </Button>
                  </FieldGroup>
                </StepPanel>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        <div className="mt-5 flex items-center justify-between">
          <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(s - 1, 0))} disabled={step === 0}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
          {step < steps.length - 1 ? (
            <Button key="next" type="button" onClick={goNext}>
              Next
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button key="submit" type="submit" loading={createTournament.isPending}>
              <Check className="size-4" />
              Create tournament
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

function Stepper({ current }: { current: number }) {
  const icons = [Trophy, Clock, MapPin]
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => {
        const Icon = icons[i]
        const state = i < current ? 'done' : i === current ? 'active' : 'upcoming'
        return (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                state === 'done' && 'border-ember-500 bg-ember-500 text-ink',
                state === 'active' && 'border-ember-500 text-ember-600',
                state === 'upcoming' && 'border-white/20 text-court-cream/35'
              )}
            >
              {state === 'done' ? <Check className="size-4" /> : <Icon className="size-4" />}
            </div>
            <span className={cn('hidden text-sm font-semibold sm:inline', state === 'upcoming' ? 'text-court-cream/35' : 'text-court-cream/70')}>
              {label}
            </span>
            {i < steps.length - 1 && <div className={cn('h-0.5 flex-1 rounded-full', state === 'done' ? 'bg-ember-500' : 'bg-white/15')} />}
          </div>
        )
      })}
    </div>
  )
}

function StepPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-5"
    >
      {children}
    </motion.div>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId()
  // The field control is always the first child; FieldError (if present) follows it --
  // cloning the id in here is what lets every call site keep the plain <Label>children API.
  const [control, ...rest] = Children.toArray(children)
  const controlWithId = isValidElement(control) ? cloneElement(control, { id } as Record<string, unknown>) : control

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {controlWithId}
      {rest}
    </div>
  )
}

function FormatSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: 'GROUP_KNOCKOUT' | 'SWISS_KNOCKOUT' | 'KNOCKOUT'
  onChange: (value: 'GROUP_KNOCKOUT' | 'SWISS_KNOCKOUT' | 'KNOCKOUT') => void
}) {
  return (
    <FieldGroup label={label}>
      <Select value={value} onValueChange={(nextValue) => onChange(nextValue as typeof value)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="GROUP_KNOCKOUT">Group + Knockout</SelectItem>
          <SelectItem value="SWISS_KNOCKOUT">Swiss + Knockout</SelectItem>
          <SelectItem value="KNOCKOUT">Knockout</SelectItem>
        </SelectContent>
      </Select>
    </FieldGroup>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <FieldGroup label={label}>
      <Input type="number" min={0} max={30} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </FieldGroup>
  )
}

function MatchOrderEditor({
  order,
  onReorder,
}: {
  order: ('SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES')[]
  onReorder: (order: ('SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES')[]) => void
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  function move(from: number, to: number) {
    if (from === to) return
    const next = [...order]
    const [slot] = next.splice(from, 1)
    next.splice(to, 0, slot)
    onReorder(next)
  }

  return (
    <FieldGroup label="Match order (drag to reorder)">
      <ol className="space-y-1.5">
        {order.map((slot, index) => (
          <li
            key={slot + '-' + index}
            draggable
            onDragStart={(event) => {
              setActiveIndex(index)
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', String(index))
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const from = Number(event.dataTransfer.getData('text/plain'))
              if (Number.isInteger(from)) move(from, index)
              setActiveIndex(null)
            }}
            onDragEnd={() => setActiveIndex(null)}
            className={cn(
              'flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2',
              activeIndex === index && 'opacity-40'
            )}
          >
            <GripVertical className="size-4 shrink-0 cursor-grab text-court-cream/35" aria-hidden="true" />
            <span className="w-6 text-xs tabular-nums text-court-cream/45">{index + 1}.</span>
            <span className="flex-1 text-sm font-semibold text-court-cream">{slot === 'SINGLES' ? 'Singles' : slot === 'DOUBLES' ? 'Doubles' : 'Mixed Doubles'}</span>
            <div className="flex items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Move match ${index + 1} up`}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <ArrowUp className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Move match ${index + 1} down`}
                disabled={index === order.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <ArrowDown className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ol>
    </FieldGroup>
  )
}

function CategoryOption({
  icon: Icon,
  active,
  title,
  onClick,
}: {
  icon: typeof Briefcase
  active: boolean
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl border-2 p-3.5 text-center transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500 focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
        active ? 'border-ember-500 bg-ember-500/15 shadow-sm' : 'border-white/20 hover:border-white/25'
      )}
    >
      <Icon className={cn('size-5', active ? 'text-ember-600' : 'text-court-cream/45')} aria-hidden="true" />
      <p className="text-xs font-bold text-court-cream">{title}</p>
    </button>
  )
}
