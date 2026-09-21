import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// For plain "YYYY-MM-DD" calendar dates (no time/timezone component, e.g. a
// tournament's date). Parses the digits directly instead of via `Date`, which
// would otherwise anchor the string to UTC midnight and can roll the date back
// a day once converted to the viewer's local timezone for display.
export function formatPlainDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return '—'
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function isPlaceholderId(id: string | null | undefined): boolean {
  return !id || id.includes('TBD')
}

export function formatLabel(format: 'GROUP_KNOCKOUT' | 'SWISS_KNOCKOUT'): string {
  return format === 'GROUP_KNOCKOUT' ? 'Group + Knockout' : 'Swiss + Knockout'
}

/**
 * Placeholder rows carry the raw internal slot id as their name (e.g. "TBD_Seed_1",
 * "TBD_R1_M1_Win") — this turns that into something a reader can parse at a glance.
 */
function prettifyPlaceholderName(raw: string): string {
  const seedMatch = raw.match(/^TBD_Seed_?(\d+)$/)
  if (seedMatch) return `Seed ${seedMatch[1]}`

  const sfMatch = raw.match(/^TBD_SF(\d+)_Win$/)
  if (sfMatch) return `Winner of SF${sfMatch[1]}`

  const roundWinMatch = raw.match(/^TBD_R(\d+)_M(\d+)_Win$/)
  if (roundWinMatch) return `Winner of R${roundWinMatch[1]} M${roundWinMatch[2]}`

  const roundSlotMatch = raw.match(/^TBD_R(\d+)_/)
  if (roundSlotMatch) return `Round ${roundSlotMatch[1]} qualifier`

  if (raw.startsWith('TBD')) return 'TBD'
  return raw
}

export function playerLabel(id: string | null | undefined, playersById: Map<string, { name: string; is_placeholder?: boolean }>): string {
  if (!id) return 'TBD'
  const player = playersById.get(id)
  if (!player) return 'TBD'
  return player.is_placeholder ? prettifyPlaceholderName(player.name) : player.name
}

// The backend stamps actual_start_time/actual_end_time with naive UTC (no offset), which
// `new Date()` would otherwise read as local time.
export function parseUtcTimestamp(iso: string): Date {
  return new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`)
}
