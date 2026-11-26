import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AppLayout from './components/layout/AppLayout.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import AddInterview from './pages/AddInterview.jsx'
import { InterviewHistory, Analytics, Weaknesses, AIInsights, Profile, Settings } from './pages/WorkspacePages.jsx'
import './App.css'
import './styles/workspace.css'
import './styles/hud.css'

function GuestRoute() {
  const { user, loading } = useAuth()

  if (loading) return <p className="session-status" role="status">Checking your session...</p>
  return user ? <Navigate to="/dashboard" replace /> : <Outlet />
}

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { element: <GuestRoute />, children: [
    { path: '/login', element: <Login /> },
    { path: '/register', element: <Register /> },
  ] },
  { element: <ProtectedRoute />, children: [
    { element: <AppLayout />, children: [
      { path: '/dashboard', element: <Dashboard /> },
      { path: '/interviews/new', element: <AddInterview /> },
      { path: '/interviews', element: <InterviewHistory /> },
      { path: '/analytics', element: <Analytics /> },
      { path: '/weaknesses', element: <Weaknesses /> },
      { path: '/ai-insights', element: <AIInsights /> },
      { path: '/profile', element: <Profile /> },
      { path: '/settings', element: <Settings /> },
    ] },
  ] },
  { path: '*', element: <Navigate to="/" replace /> },
])

export default function App() {
  return <AuthProvider><RouterProvider router={router} /></AuthProvider>
}
