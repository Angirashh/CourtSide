import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, PlusCircle, Trophy, User as UserIcon } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useScrollToTop } from '@/hooks/use-scroll-to-top'
import { BrandMark, BrandWordmark } from '@/components/brand/logo'
import { cn, initials } from '@/lib/utils'
import { OrganiserApprovalsBell } from './organiser-approvals-bell'

const organiserNav = [
  { to: '/organiser', label: 'Tournaments', icon: Trophy, end: true },
  { to: '/organiser/new', label: 'Create', icon: PlusCircle, end: false },
]

export function AppShell() {
  const user = useAuthStore((s) => s.user)
  const clearSession = useAuthStore((s) => s.clearSession)
  const navigate = useNavigate()
  useScrollToTop()

  function handleLogout() {
    clearSession()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-svh bg-paper text-court-cream">
      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col">
        <div className="flex grow flex-col gap-y-6 bg-atmosphere px-6 py-8">
          <div className="flex items-center justify-between gap-2">
            <Brand />
            <OrganiserApprovalsBell />
          </div>
          <nav className="flex flex-1 flex-col gap-1">
            {organiserNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-full px-3.5 py-2.5 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-ember-500 text-ink shadow-sm'
                      : 'text-cream-200/80 hover:bg-white/10 hover:text-cream-50'
                  )
                }
              >
                <item.icon className="size-[18px]" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <UserFooter name={user?.name} role={user?.role} onLogout={handleLogout} />
        </div>
      </div>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-ink/90 px-4 py-3 backdrop-blur-md lg:hidden">
        <Brand compact />
        <div className="flex items-center gap-2">
          <OrganiserApprovalsBell compact />
          <button
            onClick={handleLogout}
            className="flex size-9 items-center justify-center rounded-full bg-white/10 text-court-cream/60 active:scale-95"
            aria-label="Log out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <main className="pb-24 lg:pb-10 lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-white/10 bg-ink/95 py-2 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {organiserNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 rounded-full px-5 py-1.5 text-[11px] font-semibold transition-colors',
                isActive ? 'text-ember-600' : 'text-court-cream/45'
              )
            }
          >
            <item.icon className="size-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark size={compact ? 32 : 36} />
      <div>
        <BrandWordmark className={cn('text-lg', compact ? 'text-court-cream' : 'text-cream-50')} />
        {!compact && <p className="mt-1 text-[11px] tracking-wide text-cream-200/60">Tournament Organiser</p>}
      </div>
    </div>
  )
}

function UserFooter({ name, role, onLogout }: { name?: string; role?: string; onLogout: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ember-500/90 text-sm font-bold text-ink">
        {name ? initials(name) : <UserIcon className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-cream-50">{name ?? 'Organiser'}</p>
        <p className="text-[11px] uppercase tracking-wide text-cream-200/50">{role}</p>
      </div>
      <button
        onClick={onLogout}
        className="flex size-8 items-center justify-center rounded-full text-cream-200/60 transition-colors hover:bg-white/10 hover:text-cream-50"
        aria-label="Log out"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  )
}
