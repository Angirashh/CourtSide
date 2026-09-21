import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Baby, Briefcase, Check, Clock, GraduationCap, Handshake, MapPin, Plus, Swords, Trash2, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { useCreateTournament } from '@/hooks/use-tournaments'
import { extractErrorMessage } from '@/lib/api/client'
import { cn } from '@/lib/utils'

const schema = z.object({
  name: z.string().min(3, 'Give your tournament a name'),
  format: z.enum(['GROUP_KNOCKOUT', 'SWISS_KNOCKOUT']),
  category: z.enum(['CORPORATE', 'COLLEGE', 'JUNIOR', 'FRIENDLY']),
  venue: z.string().min(2, 'Add a venue'),
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
    control,
    trigger,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      format: 'GROUP_KNOCKOUT',
      category: 'CORPORATE',
      venue: '',
      tournament_date: '',
      match_duration_minutes: 15,
      rest_time_minutes: 10,
      shuttle_cost: 220,
      shuttle_matches_per_unit: 3,
      courts: [{ name: 'Court 1', hourly_rate: 300 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'courts' })
  const format = watch('format')
  const category = watch('category')

  async function goNext() {
    const fieldsToValidate: (keyof FormInput)[][] = [
      ['name', 'format', 'category', 'venue', 'tournament_date'],
      ['match_duration_minutes', 'rest_time_minutes', 'shuttle_cost', 'shuttle_matches_per_unit'],
      ['courts'],
    ]
    const valid = await trigger(fieldsToValidate[step])
    if (valid) setStep((s) => Math.min(s + 1, steps.length - 1))
  }

  const onSubmit = handleSubmit((values) => {
    createTournament.mutate(values, {
      onSuccess: (tournament) => {
        toast.success('Tournament created — now build your roster.')
        navigate(`/organiser/${tournament.id}`)
      },
      onError: (err) => toast.error(extractErrorMessage(err)),
    })
  })

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <div>
        <h1 className="font-display text-2xl font-medium text-navy-900 sm:text-3xl">Create a tournament</h1>
        <p className="mt-1 text-sm text-navy-500">Three quick steps, then straight to your roster.</p>
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

                  <FieldGroup label="Format">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormatOption
                        active={format === 'GROUP_KNOCKOUT'}
                        title="Group + Knockout"
                        description="Round-robin groups, top finishers advance to a knockout bracket."
                        onClick={() => setValue('format', 'GROUP_KNOCKOUT')}
                      />
                      <FormatOption
                        active={format === 'SWISS_KNOCKOUT'}
                        title="Swiss + Knockout"
                        description="Everyone plays every round, best records advance to knockout semis."
                        onClick={() => setValue('format', 'SWISS_KNOCKOUT')}
                      />
                    </div>
                  </FieldGroup>

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
                  <p className="rounded-lg bg-navy-100/60 px-3.5 py-3 text-xs leading-relaxed text-navy-600">
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
                  <p className="rounded-lg bg-navy-100/60 px-3.5 py-3 text-xs leading-relaxed text-navy-600">
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
                        <div key={field.id} className="flex items-center gap-2.5">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-navy-500">
                            <MapPin className="size-4" />
                          </div>
                          <Input placeholder="Court name" {...register(`courts.${idx}.name` as const)} />
                          <div className="relative w-32 shrink-0">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-navy-400">
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
                            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-navy-400 transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-30"
                          >
                            <Trash2 className="size-4" />
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
                state === 'done' && 'border-ember-500 bg-ember-500 text-navy-950',
                state === 'active' && 'border-ember-500 text-ember-600',
                state === 'upcoming' && 'border-navy-200 text-navy-300'
              )}
            >
              {state === 'done' ? <Check className="size-4" /> : <Icon className="size-4" />}
            </div>
            <span className={cn('hidden text-sm font-semibold sm:inline', state === 'upcoming' ? 'text-navy-300' : 'text-navy-700')}>
              {label}
            </span>
            {i < steps.length - 1 && <div className={cn('h-0.5 flex-1 rounded-full', state === 'done' ? 'bg-ember-500' : 'bg-navy-200')} />}
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
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function FormatOption({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-all',
        active ? 'border-ember-500 bg-ember-100/50 shadow-sm' : 'border-navy-200 hover:border-navy-300'
      )}
    >
      <div className="flex items-center justify-between">
        <Swords className={cn('size-4', active ? 'text-ember-600' : 'text-navy-400')} />
        {active && <Check className="size-4 text-ember-600" />}
      </div>
      <div>
        <p className="text-sm font-bold text-navy-900">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-navy-500">{description}</p>
      </div>
    </button>
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
        'flex flex-col items-center gap-2 rounded-xl border-2 p-3.5 text-center transition-all',
        active ? 'border-ember-500 bg-ember-100/50 shadow-sm' : 'border-navy-200 hover:border-navy-300'
      )}
    >
      <Icon className={cn('size-5', active ? 'text-ember-600' : 'text-navy-400')} />
      <p className="text-xs font-bold text-navy-900">{title}</p>
    </button>
  )
}
