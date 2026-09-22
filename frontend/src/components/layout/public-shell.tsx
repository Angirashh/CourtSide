import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ArrowRight, Info, LayoutGrid, Sparkles, Trophy, UserRound } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

const publicNav = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/tournaments', label: 'Tournaments', icon: Trophy, end: false },
  { to: '/about', label: 'About', icon: Info, end: false },
  { to: '/players', label: 'My profile', icon: UserRound, end: false },
]

export function PublicShell() {
  return (
    <div className="min-h-svh bg-paper text-navy-900">
      <Sidebar />
      <div className="min-h-svh pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-64">
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-cream-200 bg-cream-25/95 backdrop-blur lg:hidden"
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
                'relative flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors active:bg-navy-100/60',
                isActive ? 'text-navy-900' : 'text-navy-400'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-x-6 top-0 h-0.5 rounded-b-full bg-ember-500" />}
                <item.icon className={cn('size-5', isActive && 'text-ember-600')} />
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
        { label: 'How it works', to: '/about#how-it-works' },
      ],
    },
    {
      title: 'Organisers',
      links: [
        { label: 'Create event', to: '/organiser/new' },
        { label: 'Fixtures', to: '/tournaments' },
        { label: 'Standings', to: '/tournaments' },
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
    <footer className="bg-navy-900 px-4 py-10 text-cream-50 sm:px-6 lg:px-10">
      <div className="flex flex-col justify-between gap-10 lg:flex-row lg:gap-8">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-ember-500 text-navy-950 shadow-sm">
              <LayoutGrid className="size-[18px]" strokeWidth={2.5} />
            </div>
            <p className="font-display text-lg font-medium leading-none text-cream-50">
              Court<span className="text-ember-500">side</span>
            </p>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-navy-300">
            The home for tournaments across corporates, colleges and juniors. Every bracket, every route, one place
            to run it from.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:gap-16">
          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-bold text-cream-50">{col.title}</p>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.to} className="text-sm text-navy-300 transition-colors hover:text-cream-50">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-9 border-t border-navy-700 pt-6">
        <p className="text-xs text-navy-400">© {new Date().getFullYear()} Courtside. All rights reserved.</p>
      </div>
    </footer>
  )
}

function Sidebar() {
  const user = useAuthStore((s) => s.user)

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
                'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
                isActive ? 'bg-ember-500 text-navy-950 shadow-sm' : 'text-cream-200/80 hover:bg-navy-800 hover:text-cream-50'
              )
            }
          >
            <item.icon className="size-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto">
        <div className="mb-5 rounded-2xl border border-navy-700 bg-navy-800/60 p-4">
          <div className="flex items-center gap-2 text-ember-400">
            <Sparkles className="size-3.5" />
            <span className="font-mono text-[10px] uppercase tracking-[.14em]">Organiser desk</span>
          </div>
          <p className="mt-3 text-sm font-semibold leading-5 text-cream-50">
            Running the event?
            <br />
            Manage it here.
          </p>
          <NavLink
            to={user ? (user.role === 'ORGANISER' ? '/organiser' : '/operator') : '/login'}
            className="mt-4 flex items-center gap-1.5 text-xs font-bold text-ember-400 hover:text-cream-50"
          >
            {user ? 'Go to dashboard' : 'Organiser sign in'} <ArrowRight className="size-3.5" />
          </NavLink>
        </div>
      </div>
    </aside>
  )
}

function Topbar() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  return (
    <header className="flex h-16 items-center justify-between border-b border-cream-200 px-4 sm:px-6 lg:h-[72px] lg:px-10">
      <NavLink to="/" className="flex items-center gap-2.5 lg:hidden" aria-label="Courtside home">
        <div className="flex size-9 items-center justify-center rounded-xl bg-ember-500 text-navy-950 shadow-sm">
          <LayoutGrid className="size-[18px]" strokeWidth={2.5} />
        </div>
        <span className="font-display text-lg font-medium leading-none text-navy-900">
          Court<span className="text-ember-600">side</span>
        </span>
      </NavLink>
      <div className="hidden font-display text-lg font-medium text-navy-900 lg:block">Courtside</div>
      <button
        onClick={() => navigate(user ? (user.role === 'ORGANISER' ? '/organiser' : '/operator') : '/login')}
        className="inline-flex items-center gap-2 rounded-xl border border-cream-200 bg-cream-25 px-3.5 py-2 text-xs font-bold text-navy-900 transition hover:border-ember-400"
      >
        <UserRound className="size-4" />
        {user ? 'Dashboard' : 'Sign in'}
      </button>
    </header>
  )
}

function Brand() {
  return (
    <NavLink to="/" className="flex items-center gap-2.5">
      <div className="flex size-9 items-center justify-center rounded-xl bg-ember-500 text-navy-950 shadow-sm">
        <LayoutGrid className="size-[18px]" strokeWidth={2.5} />
      </div>
      <p className="font-display text-lg font-medium leading-none text-cream-50">
        Court<span className="text-ember-500">side</span>
      </p>
    </NavLink>
  )
}
