import { Children, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CarouselHandle {
  goTo: (index: number) => void
}

/** Scroll-snap carousel: swipe on touch, arrows on larger screens, dots for position. */
export const Carousel = forwardRef<
  CarouselHandle,
  {
    children: React.ReactNode
    className?: string
    /** Lets the parent place the prev/next buttons (e.g. in a section header). */
    renderControls?: (controls: React.ReactNode) => React.ReactNode
    /** Slide to start on (e.g. the tournament's current round). Applied once, on mount. */
    defaultIndex?: number
    /** Overrides the default "peek the next card" width — e.g. `basis-full` for content that isn't a preview card. */
    slideClassName?: string
    /** Skip the built-in dot indicators — e.g. when the parent renders its own (a round stepper). */
    hideDots?: boolean
    /** Fires whenever the active slide changes, from a swipe, an arrow, or a `ref.goTo()` call. */
    onActiveChange?: (index: number) => void
  }
>(function Carousel({ children, className, renderControls, defaultIndex = 0, slideClassName, hideDots, onActiveChange }, ref) {
  const slides = Children.toArray(children)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const didInit = useRef(false)

  const syncActive = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const kids = Array.from(el.children) as HTMLElement[]
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 2) {
      setActive(kids.length - 1)
      onActiveChange?.(kids.length - 1)
      return
    }
    let best = 0
    let bestDist = Infinity
    kids.forEach((kid, i) => {
      const dist = Math.abs(kid.offsetLeft - el.scrollLeft)
      if (dist < bestDist) {
        best = i
        bestDist = dist
      }
    })
    setActive(best)
    onActiveChange?.(best)
  }, [onActiveChange])

  useEffect(() => {
    const el = scrollerRef.current
    if (el && !didInit.current && defaultIndex > 0) {
      didInit.current = true
      const target = el.children[defaultIndex] as HTMLElement | undefined
      if (target) el.scrollLeft = target.offsetLeft
    }
    syncActive()
    window.addEventListener('resize', syncActive)
    return () => window.removeEventListener('resize', syncActive)
  }, [syncActive, slides.length, defaultIndex])

  function goTo(index: number) {
    const el = scrollerRef.current
    const target = el?.children[index] as HTMLElement | undefined
    if (el && target) el.scrollTo({ left: target.offsetLeft, behavior: 'smooth' })
  }

  useImperativeHandle(ref, () => ({ goTo }), [])

  const controls = (
    <div className="hidden items-center gap-2 sm:flex">
      <ArrowButton label="Previous" disabled={active === 0} onClick={() => goTo(active - 1)}>
        <ChevronLeft className="size-4" />
      </ArrowButton>
      <ArrowButton label="Next" disabled={active >= slides.length - 1} onClick={() => goTo(active + 1)}>
        <ChevronRight className="size-4" />
      </ArrowButton>
    </div>
  )

  return (
    <div className={className}>
      {renderControls?.(controls)}
      <div
        ref={scrollerRef}
        onScroll={syncActive}
        className="relative -my-2 flex snap-x snap-mandatory gap-4 overflow-x-auto py-2 no-scrollbar"
      >
        {slides.map((slide, i) => (
          <div key={i} className={cn('shrink-0 snap-start', slideClassName ?? 'basis-full sm:basis-[62%] lg:basis-[52%]')}>
            {slide}
          </div>
        ))}
      </div>
      {!hideDots && slides.length > 1 && (
        <div className="mt-4 flex justify-center gap-1.5" role="tablist" aria-label="Slides">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => goTo(i)}
              className={cn('h-1.5 rounded-full transition-all', i === active ? 'w-6 bg-ember-500' : 'w-1.5 bg-navy-200')}
            />
          ))}
        </div>
      )}
    </div>
  )
})

function ArrowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-full border border-cream-200 bg-cream-25 text-navy-700 transition hover:border-ember-400 disabled:opacity-35 disabled:hover:border-cream-200"
    >
      {children}
    </button>
  )
}
