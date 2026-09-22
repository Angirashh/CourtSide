import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { LayoutGrid, KeyRound, Mail, ShieldCheck, Users } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { useOrganiserLogin, useOrganiserSignup, useOperatorLogin } from '@/hooks/use-auth'
import { extractErrorMessage } from '@/lib/api/client'
import { cn } from '@/lib/utils'

type Role = 'ORGANISER' | 'OPERATOR'

export function AuthPage() {
  // A "Join as operator" link elsewhere in the app can deep-link straight into the
  // operator tab (e.g. `/login?role=operator`) instead of dropping people on Organiser
  // and making them find the toggle themselves.
  const [searchParams] = useSearchParams()
  const [role, setRole] = useState<Role>(searchParams.get('role')?.toUpperCase() === 'OPERATOR' ? 'OPERATOR' : 'ORGANISER')
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-atmosphere px-4 py-10">
      <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:radial-gradient(circle,white_1px,transparent_1px)] [background-size:22px_22px]" />

      <div className="relative w-full max-w-md animate-fade-up">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-ember-500 text-navy-950 shadow-lg shadow-ember-500/20">
            <LayoutGrid className="size-7" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-display text-3xl font-medium text-cream-50">
              Court<span className="text-ember-500">side</span>
            </h1>
            <p className="mt-1 text-sm text-cream-200/60">Every route tells a story. Run yours, swiftly.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-cream-50/10 bg-cream-50/[0.04] p-1.5 shadow-2xl shadow-navy-950/40 backdrop-blur-sm">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-navy-950/40 p-1">
            <RoleTab active={role === 'ORGANISER'} onClick={() => setRole('ORGANISER')} icon={ShieldCheck} label="Organiser" />
            <RoleTab active={role === 'OPERATOR'} onClick={() => setRole('OPERATOR')} icon={Users} label="Court Operator" />
          </div>

          <div className="p-5 pt-4">
            <AnimatePresence mode="wait">
              {role === 'ORGANISER' ? (
                <motion.div key="organiser" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                  <div className="mb-4 flex justify-center gap-1 rounded-lg bg-navy-950/30 p-1 text-xs font-semibold">
                    <button
                      onClick={() => setMode('login')}
                      className={cn('flex-1 rounded-md py-1.5 transition-colors', mode === 'login' ? 'bg-cream-50 text-navy-900' : 'text-cream-200/60')}
                    >
                      Log in
                    </button>
                    <button
                      onClick={() => setMode('signup')}
                      className={cn('flex-1 rounded-md py-1.5 transition-colors', mode === 'signup' ? 'bg-cream-50 text-navy-900' : 'text-cream-200/60')}
                    >
                      Create account
                    </button>
                  </div>
                  {mode === 'login' ? <OrganiserLoginForm /> : <OrganiserSignupForm onDone={() => setMode('login')} />}
                </motion.div>
              ) : (
                <motion.div key="operator" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                  <OperatorLoginForm />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

function RoleTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof ShieldCheck; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold uppercase tracking-wide transition-all',
        active ? 'bg-ember-500 text-navy-950 shadow-sm' : 'text-cream-200/50 hover:text-cream-100'
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}

const organiserLoginSchema = z.object({
  identifier: z.string().min(3, 'Enter your email or phone'),
  pin: z.string().min(4, 'PIN must be at least 4 characters'),
})

function OrganiserLoginForm() {
  const navigate = useNavigate()
  const login = useOrganiserLogin()
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof organiserLoginSchema>>({
    resolver: zodResolver(organiserLoginSchema),
  })

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: () => navigate('/organiser'),
      onError: (err) => toast.error(extractErrorMessage(err)),
    })
  })

  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      <FormField label="Email or phone" icon={Mail}>
        <Input placeholder="you@club.com" {...register('identifier')} />
        <FieldError>{errors.identifier?.message}</FieldError>
      </FormField>
      <FormField label="PIN" icon={KeyRound}>
        <Input type="password" placeholder="••••••" {...register('pin')} />
        <FieldError>{errors.pin?.message}</FieldError>
      </FormField>
      <Button type="submit" className="w-full" size="lg" loading={login.isPending}>
        Log in
      </Button>
    </form>
  )
}

const organiserSignupSchema = z
  .object({
    name: z.string().min(2, 'Enter your name'),
    email: z.string().email('Enter a valid email').optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    pin: z.string().min(4, 'At least 4 characters'),
  })
  .refine((data) => data.email || data.phone, { message: 'Add an email or phone number', path: ['email'] })

function OrganiserSignupForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const signup = useOrganiserSignup()
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof organiserSignupSchema>>({
    resolver: zodResolver(organiserSignupSchema),
  })

  const onSubmit = handleSubmit((values) => {
    signup.mutate(
      { name: values.name, email: values.email || undefined, phone: values.phone || undefined, pin: values.pin },
      {
        onSuccess: () => navigate('/organiser'),
        onError: (err) => {
          toast.error(extractErrorMessage(err))
          onDone()
        },
      }
    )
  })

  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      <FormField label="Full name">
        <Input placeholder="Rhythm Mahajan" {...register('name')} />
        <FieldError>{errors.name?.message}</FieldError>
      </FormField>
      <FormField label="Email">
        <Input placeholder="you@club.com" {...register('email')} />
        <FieldError>{errors.email?.message}</FieldError>
      </FormField>
      <FormField label="Phone (optional)">
        <Input placeholder="+91 98765 43210" {...register('phone')} />
      </FormField>
      <FormField label="Choose a PIN">
        <Input type="password" placeholder="At least 4 characters" {...register('pin')} />
        <FieldError>{errors.pin?.message}</FieldError>
      </FormField>
      <Button type="submit" className="w-full" size="lg" loading={signup.isPending}>
        Create organiser account
      </Button>
    </form>
  )
}

const operatorLoginSchema = z.object({
  identifier: z.string().min(3, 'Enter your email or phone'),
  tournament_id: z.string().min(3, 'Ask your organiser for the Tournament ID'),
  pin: z.string().min(4, 'Enter the invite code'),
})

function OperatorLoginForm() {
  const navigate = useNavigate()
  const login = useOperatorLogin()
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof operatorLoginSchema>>({
    resolver: zodResolver(operatorLoginSchema),
  })

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: () => navigate('/operator'),
      onError: (err) => toast.error(extractErrorMessage(err)),
    })
  })

  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      <p className="rounded-lg bg-navy-950/30 px-3 py-2.5 text-xs text-cream-200/70">
        Your organiser invited you with a Tournament ID and a one-time PIN. Enter them below to start scoring matches.
      </p>
      <FormField label="Email or phone">
        <Input placeholder="you@example.com" {...register('identifier')} />
        <FieldError>{errors.identifier?.message}</FieldError>
      </FormField>
      <FormField label="Tournament ID">
        <Input placeholder="TOURN_xxxxxxxx" {...register('tournament_id')} />
        <FieldError>{errors.tournament_id?.message}</FieldError>
      </FormField>
      <FormField label="Invite PIN">
        <Input type="password" placeholder="••••••" {...register('pin')} />
        <FieldError>{errors.pin?.message}</FieldError>
      </FormField>
      <Button type="submit" className="w-full" size="lg" loading={login.isPending}>
        Log in to score matches
      </Button>
    </form>
  )
}

function FormField({ label, icon: Icon, children }: { label: string; icon?: typeof Mail; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-cream-100/80">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </Label>
      {children}
    </div>
  )
}
