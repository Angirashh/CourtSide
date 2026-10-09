import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label, PhoneInput } from '@/components/ui/input'
import { useClaimEmail } from '@/hooks/use-player-auth'
import { extractErrorMessage } from '@/lib/api/client'

const PHONE_RE = /^[6-9]\d{9}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ClaimEmailPage() {
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const claimEmail = useClaimEmail()

  const canSubmit = PHONE_RE.test(phone) && EMAIL_RE.test(email)

  return (
    <div className="mx-auto max-w-3xl py-6">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-medium text-court-cream">Set up your email</h1>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-court-cream/55">
          Played with us before? We have your phone number on file but need your email to let you sign in with
          Google. Enter both below to link them.
        </p>
      </div>

      <Card className="mx-auto max-w-md p-8">
        {claimEmail.isSuccess ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="size-10 text-success" />
            <p className="font-display text-lg font-medium text-court-cream">You're all set</p>
            <p className="text-sm text-court-cream/55">
              Go to <span className="font-semibold">My profile</span> and sign in with Google using {email}.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label>Phone number</Label>
              <PhoneInput value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-email">Email</Label>
              <Input
                id="claim-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
            <Button
              className="w-full"
              disabled={!canSubmit}
              loading={claimEmail.isPending}
              onClick={() =>
                claimEmail.mutate(
                  { phone, email: email.trim() },
                  { onError: (err) => toast.error(extractErrorMessage(err)) }
                )
              }
            >
              Save email
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
