import { CalendarClock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { formatCurrency, formatDuration, formatTime } from '@/lib/utils'
import type { Court, CourtBookingWindow } from '@/types/api'

export function CourtBookingsSection({
  courts,
  bookings,
}: {
  courts: Court[]
  bookings: Record<string, CourtBookingWindow>
}) {
  const rows = courts.filter((c) => bookings[c.name]).map((c) => ({ court: c, booking: bookings[c.name] }))
  if (rows.length === 0) return null

  const starts = rows.map((r) => new Date(r.booking.booked_from).getTime())
  const ends = rows.map((r) => new Date(r.booking.booked_until).getTime())
  const windowStart = Math.min(...starts)
  const windowSpan = Math.max(Math.max(...ends) - windowStart, 1)

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-navy-600">
          <CalendarClock className="size-4" />
        </div>
        <div>
          <h2 className="font-display text-base font-medium leading-none text-navy-900">Court bookings</h2>
          <p className="mt-1 text-xs text-navy-400">When each court needs to be booked, and what it costs.</p>
        </div>
      </div>

      <ul className="space-y-3">
        {rows.map(({ court, booking }, i) => {
          const left = ((starts[i] - windowStart) / windowSpan) * 100
          const width = Math.max(((ends[i] - starts[i]) / windowSpan) * 100, 2)
          return (
            <li key={court.id} className="grid items-center gap-x-5 gap-y-1.5 sm:grid-cols-[6rem_minmax(0,1fr)_13.5rem]">
              <p className="truncate text-sm font-semibold text-navy-900">{court.name}</p>
              <div className="relative h-2.5 rounded-full bg-cream-200" aria-hidden>
                <div className="absolute inset-y-0 rounded-full bg-ember-500" style={{ left: `${left}%`, width: `${width}%` }} />
              </div>
              <div className="whitespace-nowrap sm:text-right">
                <p className="text-sm font-semibold text-navy-900">
                  {formatTime(booking.booked_from)} – {formatTime(booking.booked_until)}
                </p>
                <p className="text-xs text-navy-400">
                  {formatDuration(booking.duration_minutes)} · {booking.billed_hours}h billed ·{' '}
                  <span className="font-semibold text-ember-600">{formatCurrency(booking.court_cost)}</span>
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
