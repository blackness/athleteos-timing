import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Events from './pages/Events'
import FinishLine from './pages/FinishLine'
import Results from './pages/Results'
import Assign from './pages/Assign'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{
      minHeight: '100dvh', background: '#080b0f',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#4a5568', fontFamily: 'sans-serif', fontSize: 14
    }}>
      Loading...
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Results is public — no auth needed */}
      <Route path="/results/:id" element={<Results />} />
      {/* Protected routes */}
      <Route path="/" element={<ProtectedRoute><Events /></ProtectedRoute>} />
      <Route path="/finish/:id" element={<ProtectedRoute><FinishLine /></ProtectedRoute>} />
      <Route path="/assign/:id" element={<ProtectedRoute><Assign /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
