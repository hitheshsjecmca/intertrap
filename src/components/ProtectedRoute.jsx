import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) return <p className="session-status" role="status">Checking your session...</p>
  return user ? <Outlet /> : <Navigate to="/login" replace />
}
