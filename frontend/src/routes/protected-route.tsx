import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import type { UserRole } from '@/types/api'

const roleHome: Record<UserRole, string> = {
  ORGANISER: '/organiser',
  OPERATOR: '/operator',
  PLAYER: '/players',
}

export function ProtectedRoute({ allow }: { allow: UserRole }) {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)

  if (!token || !user) return <Navigate to="/login" replace />
  if (user.role !== allow) {
    return <Navigate to={roleHome[user.role]} replace />
  }
  return <Outlet />
}
