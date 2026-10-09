import { Outlet, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { BrandMark, BrandWordmark } from '@/components/brand/logo'

export function OperatorShell() {
  const user = useAuthStore((s) => s.user)
  const clearSession = useAuthStore((s) => s.clearSession)
  const navigate = useNavigate()

  return (
    <div className="min-h-svh bg-paper text-court-cream">
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-atmosphere px-4 py-3.5 shadow-sm"
        style={{ paddingTop: 'max(0.875rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2.5">
          <BrandMark size={32} />
          <div>
            <BrandWordmark className="text-sm text-cream-50" />
            <p className="mt-0.5 text-[11px] text-cream-200/50">{user?.name}</p>
          </div>
        </div>
        <button
          onClick={() => {
            clearSession()
            navigate('/login', { replace: true })
          }}
          className="flex size-9 items-center justify-center rounded-full bg-white/10 text-cream-100 active:scale-95"
          aria-label="Log out"
        >
          <LogOut className="size-4" />
        </button>
      </header>
      {user?.role === 'ORGANISER' && (
        <div className="border-b border-ember-200 bg-ember-100 px-4 py-2 text-center text-xs font-semibold text-ember-600">
          Operating as organiser.
        </div>
      )}
      <main className="mx-auto max-w-3xl px-4 py-5 pb-10 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
