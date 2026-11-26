import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import './App.css'

function GuestRoute() {
  const { user, loading } = useAuth()

  if (loading) return <p className="session-status" role="status">Checking your session...</p>
  return user ? <Navigate to="/dashboard" replace /> : <Outlet />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
