import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Trophy, UserX } from 'lucide-react'
import { cn, formatDateTime, playerLabel } from '@/lib/utils'
import { MatchStatusBadge } from '@/components/ui/status-badge'
import type { Match, Player } from '@/types/api'

function roundLabel(roundIndex: number, totalRounds: number): string {
  const fromEnd = totalRounds - roundIndex
  if (fromEnd === 1) return 'Final'
  if (fromEnd === 2) return 'Semifinal'
  if (fromEnd === 3) return 'Quarterfinal'
  return `Round ${roundIndex + 1}`
}

interface Edge {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  advanced: boolean
}

const LINE_IDLE = 'var(--color-navy-200)'
const LINE_ADVANCED = 'var(--color-ember-500)'

export function BracketTree({ matches, playersById }: { matches: Match[]; playersById: Map<string, Player> }) {
  const byRound = useMemo(() => {
    const rounds = Array.from(new Set(matches.map((m) => m.round_num))).sort((a, b) => a - b)
    return rounds.map((r) => matches.filter((m) => m.round_num === r).sort((a, b) => a.id.localeCompare(b.id)))
  }, [matches])
  const rounds = byRound.map((r) => r[0]?.round_num)
  const champion = matches.find((m) => m.round_num === rounds[rounds.length - 1] && m.is_completed)

  const contentRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const [edges, setEdges] = useState<Edge[]>([])
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return

    function measure() {
      const containerRect = content!.getBoundingClientRect()
      const nextEdges: Edge[] = []

      for (let r = 0; r < byRound.length - 1; r++) {
        const sourceRound = byRound[r]
        for (let i = 0; i < sourceRound.length; i++) {
          const sourceMatch = sourceRound[i]
          const targetMatch = byRound[r + 1]?.[Math.floor(i / 2)]
          if (!targetMatch) continue
          const sourceEl = cardRefs.current.get(sourceMatch.id)
          const targetEl = cardRefs.current.get(targetMatch.id)
          if (!sourceEl || !targetEl) continue

          const sRect = sourceEl.getBoundingClientRect()
          const tRect = targetEl.getBoundingClientRect()

          nextEdges.push({
            id: `${sourceMatch.id}->${targetMatch.id}`,
            x1: sRect.right - containerRect.left,
            y1: sRect.top + sRect.height / 2 - containerRect.top,
            x2: tRect.left - containerRect.left,
            y2: tRect.top + tRect.height / 2 - containerRect.top,
            advanced: !!sourceMatch.is_completed && !!sourceMatch.winner_id,
          })
        }
      }

      setEdges(nextEdges)
      setCanvasSize({ width: content!.scrollWidth, height: content!.scrollHeight })
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(content)
    cardRefs.current.forEach((el) => ro.observe(el))
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [matches, byRound])

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto pb-4 no-scrollbar">
        <div ref={contentRef} className="relative" style={{ width: 'max-content' }}>
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={canvasSize.width}
            height={canvasSize.height}
          >
            {edges.map((e) => {
              const midX = e.x1 + (e.x2 - e.x1) / 2
              return (
                <path
                  key={e.id}
                  d={`M ${e.x1} ${e.y1} H ${midX} V ${e.y2} H ${e.x2}`}
                  fill="none"
                  stroke={e.advanced ? LINE_ADVANCED : LINE_IDLE}
                  strokeWidth={e.advanced ? 2.5 : 2}
                  className="transition-[stroke,stroke-width] duration-300"
                />
              )
            })}
          </svg>

          <div className="flex gap-6 sm:gap-10">
            {byRound.map((roundMatches, roundIdx) => (
              <div
                key={roundIdx}
                className="flex shrink-0 flex-col justify-around gap-6"
                style={{ minWidth: 220, gap: `${16 * Math.pow(1.7, roundIdx)}px` }}
              >
                <p className="sticky top-0 mb-1 text-center text-[11px] font-bold uppercase tracking-wide text-ember-600">
                  {roundLabel(roundIdx, rounds.length)}
                </p>
                {roundMatches.map((match, i) => (
                  <BracketMatchCard
                    key={match.id}
                    match={match}
                    playersById={playersById}
                    delay={roundIdx * 0.08 + i * 0.04}
                    cardRef={(el) => {
                      if (el) cardRefs.current.set(match.id, el)
                      else cardRefs.current.delete(match.id)
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {champion?.winner_id && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center justify-center gap-2.5 rounded-2xl border border-ember-300 bg-gradient-to-br from-ember-100 to-cream-100 px-5 py-4"
        >
          <div className="flex size-9 items-center justify-center rounded-full bg-ember-500 text-navy-950">
            <Trophy className="size-4" />
          </div>
          <p className="font-display text-lg font-medium text-navy-900">
            {playerLabel(champion.winner_id, playersById)} <span className="text-navy-500 text-sm font-sans">wins the title</span>
          </p>
        </motion.div>
      )}
    </div>
  )
}

function BracketMatchCard({
  match,
  playersById,
  delay,
  cardRef,
}: {
  match: Match
  playersById: Map<string, Player>
  delay: number
  cardRef: (el: HTMLDivElement | null) => void
}) {
  const p1 = match.player1_id ? playersById.get(match.player1_id) : undefined
  const p2 = match.player2_id ? playersById.get(match.player2_id) : undefined

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.3 }}
      className={cn(
        'relative w-[220px] overflow-hidden rounded-xl border bg-cream-25 shadow-sm',
        match.is_completed && match.winner_id ? 'border-ember-300' : 'border-cream-200'
      )}
    >
      <PlayerRow
        label={playerLabel(match.player1_id, playersById)}
        isWinner={!!match.winner_id && match.winner_id === match.player1_id}
        isWithdrawn={!!p1?.is_withdrawn}
        isPlaceholder={!!p1?.is_placeholder}
        score={match.scores?.map((s) => s.p1)}
      />
      <div className="h-px bg-cream-200" />
      <PlayerRow
        label={playerLabel(match.player2_id, playersById)}
        isWinner={!!match.winner_id && match.winner_id === match.player2_id}
        isWithdrawn={!!p2?.is_withdrawn}
        isPlaceholder={!!p2?.is_placeholder}
        score={match.scores?.map((s) => s.p2)}
      />
      <div className="flex items-center justify-between gap-2 border-t border-cream-200 bg-navy-100/40 px-2.5 py-1.5">
        <MatchStatusBadge status={match.status} />
        {match.is_walkover && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Walkover</span>
        )}
        {!match.is_completed && match.scheduled_start_time && (
          <span className="truncate text-[10px] font-medium text-navy-400">{formatDateTime(match.scheduled_start_time)}</span>
        )}
      </div>
    </motion.div>
  )
}

function PlayerRow({
  label,
  isWinner,
  isWithdrawn,
  isPlaceholder,
  score,
}: {
  label: string
  isWinner: boolean
  isWithdrawn: boolean
  isPlaceholder: boolean
  score?: number[]
}) {
  return (
    <div className={cn('flex items-center justify-between gap-2 px-3 py-2', isWinner && 'bg-ember-100/60')}>
      <span
        className={cn(
          'truncate text-sm',
          isPlaceholder ? 'italic text-navy-400' : 'text-navy-800',
          isWinner && 'font-bold text-navy-900'
        )}
      >
        {label}
        {isWithdrawn && <UserX className="ml-1 inline size-3 text-danger" />}
      </span>
      {score && score.length > 0 && (
        <span className="flex shrink-0 gap-1">
          {score.map((s, i) => (
            <span
              key={i}
              className={cn(
                'flex size-5 items-center justify-center rounded text-[10px] font-bold',
                isWinner ? 'bg-ember-500 text-navy-950' : 'bg-navy-100 text-navy-500'
              )}
            >
              {s}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}
