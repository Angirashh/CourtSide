import { useRef } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Info, LayoutGrid, Trophy, UserRound, Users } from 'lucide-react'
import { usePublicTournaments } from '@/hooks/use-public'
import { useScrollToTop } from '@/hooks/use-scroll-to-top'
import { BrandMark, BrandWordmark } from '@/components/brand/logo'
import { cn } from '@/lib/utils'

const publicNav = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/tournaments', label: 'Tournaments', icon: Trophy, end: false },
  { to: '/about', label: 'About', icon: Info, end: false },
  { to: '/players', label: 'My profile', icon: UserRound, end: false },
]

export function PublicShell() {
  const scrollRef = useRef<HTMLDivElement>(null)
  useScrollToTop(scrollRef)

  return (
    // Pinned to the viewport (not normal document flow) so `body` itself never has
    // anything to scroll — all scrolling happens in the inner pane below. That keeps
    // the elastic rubber-band bounce (nice to keep!) while stopping it from ever
    // dragging our `position: fixed` sidebar/bottom-nav chrome along with it.
    <div className="fixed inset-0 bg-paper text-court-cream">
      <Sidebar />
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overscroll-contain pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-64"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <Topbar />
        <main className="px-4 py-7 sm:px-6 lg:px-10 lg:py-9">
          <Outlet />
        </main>
        <Footer />
      </div>
      <BottomNav />
    </div>
  )
}

function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink/96 backdrop-blur-sm lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main navigation"
    >
      <div className="mx-auto grid max-w-3xl grid-cols-4">
        {publicNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'relative flex h-[68px] flex-col items-center justify-center gap-1 font-sans text-[9px] font-bold uppercase tracking-wider transition-colors active:bg-navy-800/60',
                isActive ? 'text-ember-500' : 'text-court-cream/45'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-x-6 top-0 h-0.5 bg-ember-500" />}
                <item.icon className={cn('size-5', isActive && 'text-ember-500')} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function Footer() {
  const columns = [
    {
      title: 'Explore',
      links: [
        { label: 'Tournaments', to: '/tournaments' },
        { label: 'Categories', to: '/tournaments' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About', to: '/about' },
        { label: 'Contact', to: '/about' },
      ],
    },
  ]

  return (
    <footer className="bg-[#191919] px-4 py-10 text-cream-50 sm:px-6 lg:px-10">
      <div className="flex flex-col justify-between gap-10 lg:flex-row lg:gap-8">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <BrandWordmark className="text-xl text-cream-50" />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-court-cream/35">
            The home for tournaments across corporates, colleges and juniors. Every bracket, every route, one place
            to run it from.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 lg:gap-16">
          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-bold text-cream-50">{col.title}</p>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.to} className="text-sm text-court-cream/35 underline transition-colors hover:text-cream-50">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-9 border-t border-white/10 pt-6">
        <p className="text-xs text-court-cream/45">© {new Date().getFullYear()} Courtside. All rights reserved.</p>
      </div>
    </footer>
  )
}

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col bg-navy-900 px-5 py-6 text-cream-50 lg:flex">
      <Brand />

      <nav className="mt-12 flex flex-1 flex-col gap-1" aria-label="Sidebar navigation">
        <p className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[.18em] text-cream-200/40">Navigate</p>
        {publicNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-full px-3.5 py-2.5 text-sm font-semibold transition-colors',
                isActive ? 'bg-ember-500 text-ink shadow-sm' : 'text-cream-200/80 hover:bg-navy-800 hover:text-cream-50'
              )
            }
          >
            <item.icon className="size-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

function Topbar() {
  const navigate = useNavigate()
  const { data: tournaments } = usePublicTournaments()
  const liveCount = (tournaments ?? []).filter((t) => t.status === 'IN_PROGRESS').length

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-ink/96 px-4 backdrop-blur-sm sm:px-6 lg:h-[72px] lg:px-10">
      <NavLink to="/" className="flex items-center gap-2.5 lg:hidden" aria-label="Courtside home">
        <BrandMark />
        <BrandWordmark className="text-xl text-court-cream" />
      </NavLink>
      <BrandWordmark className="hidden text-xl text-court-cream lg:block" />

      <div className="flex items-center gap-3">
        {liveCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs font-bold text-signal">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-signal" />
            </span>
            <span className="font-sans uppercase tracking-wide">
              {liveCount} Live
            </span>
          </div>
        )}
        <button
          onClick={() => navigate('/login?role=operator')}
          className="inline-flex items-center gap-2 border border-white/15 bg-white/5 px-3.5 py-2 font-sans text-xs font-bold text-court-cream transition hover:border-signal"
        >
          <Users className="size-4" />
          <span className="hidden sm:inline">Join as operator</span>
        </button>
      </div>
    </header>
  )
}

function Brand() {
  return (
    <NavLink to="/" className="flex items-center gap-2.5">
      <BrandMark />
      <BrandWordmark className="text-xl text-cream-50" />
    </NavLink>
  )
}
