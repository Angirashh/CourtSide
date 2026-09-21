import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import type { UserRole } from '@/types/api'

export function ProtectedRoute({ allow }: { allow: UserRole }) {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)

  if (!token || !user) return <Navigate to="/login" replace />
  if (user.role !== allow) {
    return <Navigate to={user.role === 'ORGANISER' ? '/organiser' : '/operator'} replace />
  }
  return <Outlet />
}
