import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AppLayout from './components/layout/AppLayout.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import { AIInsights, Profile, Settings } from './pages/WorkspacePages.jsx'
import './App.css'
import './styles/workspace.css'
import './styles/hud.css'
import './styles/performance.css'

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
  { element: <ProtectedRoute />, hydrateFallbackElement: <p className="session-status" role="status">Opening workspace…</p>, children: [
    { element: <AppLayout />, children: [
      { path: '/dashboard', lazy: async () => ({ Component: (await import('./pages/Dashboard.jsx')).default }) },
      { path: '/interviews/new', lazy: async () => ({ Component: (await import('./pages/AddInterview.jsx')).default }) },
      { path: '/interviews', lazy: async () => ({ Component: (await import('./pages/InterviewHistory.jsx')).default }) },
      { path: '/interviews/:id', lazy: async () => ({ Component: (await import('./pages/InterviewRecord.jsx')).default }) },
      { path: '/interviews/:id/edit', lazy: async () => {
        const { default: InterviewRecord } = await import('./pages/InterviewRecord.jsx')
        return { element: <InterviewRecord edit /> }
      } },
      { path: '/analytics', lazy: async () => ({ Component: (await import('./pages/Analytics.jsx')).default }) },
      { path: '/weaknesses', lazy: async () => ({ Component: (await import('./pages/Weaknesses.jsx')).default }) },
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
