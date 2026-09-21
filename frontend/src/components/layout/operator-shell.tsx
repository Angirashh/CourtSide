import { Outlet, useNavigate } from 'react-router-dom'
import { LayoutGrid, LogOut } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'

export function OperatorShell() {
  const user = useAuthStore((s) => s.user)
  const clearSession = useAuthStore((s) => s.clearSession)
  const navigate = useNavigate()

  return (
    <div className="min-h-svh bg-paper">
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-cream-200 bg-atmosphere px-4 py-3.5 shadow-sm"
        style={{ paddingTop: 'max(0.875rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-ember-500 text-navy-950">
            <LayoutGrid className="size-4" strokeWidth={2.5} />
          </div>
          <div>
            <p className="font-display text-sm font-medium leading-none text-cream-50">
              Court<span className="text-ember-500">side</span>
            </p>
            <p className="mt-0.5 text-[11px] text-cream-200/50">{user?.name}</p>
          </div>
        </div>
        <button
          onClick={() => {
            clearSession()
            navigate('/login', { replace: true })
          }}
          className="flex size-9 items-center justify-center rounded-full bg-cream-50/10 text-cream-100 active:scale-95"
          aria-label="Log out"
        >
          <LogOut className="size-4" />
        </button>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5 pb-10 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
