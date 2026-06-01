import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../contexts/auth-context'

export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <main className="auth-shell">Carregando...</main>
  }

  if (!session) {
    return <Navigate replace to="/login" state={{ from: location }} />
  }

  return <Outlet />
}
