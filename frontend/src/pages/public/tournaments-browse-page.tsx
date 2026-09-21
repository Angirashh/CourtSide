import { useMemo, useState } from 'react'
import { ChevronDown, Search, Trophy } from 'lucide-react'
import { usePublicTournaments } from '@/hooks/use-public'
import { PublicTournamentCard } from '@/components/public/public-tournament-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import type { TournamentFormat, TournamentStatus } from '@/types/api'

const formatOptions: Array<TournamentFormat | 'All'> = ['All', 'GROUP_KNOCKOUT', 'SWISS_KNOCKOUT']
const statusOptions: Array<TournamentStatus | 'All'> = ['All', 'IN_PROGRESS', 'SCHEDULING', 'DRAFT', 'COMPLETED']
const statusLabel: Record<string, string> = {
  All: 'All',
  IN_PROGRESS: 'Live',
  SCHEDULING: 'Upcoming',
  DRAFT: 'Upcoming',
  COMPLETED: 'Completed',
}
const formatLabelShort: Record<string, string> = {
  All: 'All',
  GROUP_KNOCKOUT: 'Group + Knockout',
  SWISS_KNOCKOUT: 'Swiss + Knockout',
}

export function TournamentsBrowsePage() {
  const { data: tournaments, isLoading } = usePublicTournaments()
  const [format, setFormat] = useState<TournamentFormat | 'All'>('All')
  const [status, setStatus] = useState<TournamentStatus | 'All'>('All')
  const [query, setQuery] = useState('')

  const filtered = useMemo(
    () =>
      (tournaments ?? []).filter(
        (t) =>
          (format === 'All' || t.format === format) &&
          (status === 'All' || t.status === status) &&
          t.name.toLowerCase().includes(query.toLowerCase())
      ),
    [tournaments, format, status, query]
  )

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-ember-600">Plan the season</p>
        <h1 className="mt-2 font-display text-3xl font-medium tracking-tight text-navy-900 sm:text-4xl">Tournament calendar</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-navy-500">
          Everything on court, from first serve to final point. Find the one you care about.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-cream-200 bg-cream-25 p-3 md:flex-row">
        <label className="flex flex-1 items-center gap-2 rounded-xl bg-cream-100 px-3 py-2.5 text-navy-400">
          <Search className="size-4" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-navy-900 outline-none placeholder:text-navy-400"
            placeholder="Find a tournament"
          />
        </label>
        <div className="flex gap-2 overflow-x-auto">
          <FilterSelect
            label="Format"
            value={format}
            onChange={(v) => setFormat(v as typeof format)}
            options={formatOptions}
            optionLabel={(v) => formatLabelShort[v]}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as typeof status)}
            options={statusOptions}
            optionLabel={(v) => statusLabel[v]}
          />
        </div>
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[.16em] text-navy-400">
        {isLoading ? 'Loading…' : `${filtered.length} tournament${filtered.length === 1 ? '' : 's'} found`}
      </p>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-52 rounded-2xl shimmer-bg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No tournaments in that frame."
          description={query ? `Nothing matched "${query}". Try a wider search.` : 'Try adjusting your filters to see the full season.'}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQuery('')
                setFormat('All')
                setStatus('All')
              }}
            >
              Reset filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t, i) => (
            <PublicTournamentCard key={t.id} tournament={t} delayMs={(i % 6) * 40} />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  optionLabel,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: T[]
  optionLabel: (value: T) => string
}) {
  return (
    <label className="flex min-w-[130px] items-center gap-2 rounded-xl bg-cream-100 px-3 py-2 text-[11px] font-bold text-navy-600">
      <span className="font-mono text-[9px] uppercase tracking-[.12em] text-navy-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full bg-transparent text-xs font-bold text-navy-900 outline-none"
      >
        {options.map((opt) => (
          <option value={opt} key={opt}>
            {optionLabel(opt)}
          </option>
        ))}
      </select>
      <ChevronDown className="size-3.5 shrink-0" />
    </label>
  )
}
