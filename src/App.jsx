import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Events from './pages/Events'
import CVDashboard from './pages/CVDashboard'
import PreRaceSetup from './pages/PreRaceSetup'
import RaceDay from './pages/RaceDay'
import BibAssign from './pages/BibAssign'
import LiveResults from './pages/LiveResults'
import CheckpointTimer from './pages/CheckpointTimer'
import CheckpointSelect from './pages/CheckpointSelect'
import CheckpointRedirect from './pages/CheckpointRedirect'
import CheckpointQrSheet from './pages/CheckpointQrSheet'
import RaceMonitor from './pages/RaceMonitor'
import RaceCorrections from './pages/RaceCorrections'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          background: '#080b0f',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#4a5568',
          fontFamily: 'sans-serif',
          fontSize: 14,
        }}
      >
        Loading...
      </div>
    )
  }

  return user ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/results/:id" element={<LiveResults />} />
      <Route path="/" element={<ProtectedRoute><Events /></ProtectedRoute>} />
      <Route path="/cv/:id" element={<ProtectedRoute><CVDashboard /></ProtectedRoute>} />
      <Route path="/race/:id/setup" element={<ProtectedRoute><PreRaceSetup /></ProtectedRoute>} />
      <Route path="/race/:id/checkpoints" element={<ProtectedRoute><CheckpointSelect /></ProtectedRoute>} />
      <Route path="/race/:id/checkpoint/:checkpointId" element={<ProtectedRoute><CheckpointTimer /></ProtectedRoute>} />
      <Route path="/race/:id/checkpoint-qr" element={<ProtectedRoute><CheckpointQrSheet /></ProtectedRoute>} />
      <Route path="/race/:id/time" element={<ProtectedRoute><RaceDay /></ProtectedRoute>} />
      <Route path="/race/:id/assign" element={<ProtectedRoute><BibAssign /></ProtectedRoute>} />
      <Route path="/c/:code" element={<ProtectedRoute><CheckpointRedirect /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
      <Route path="/race/:id/monitor" element={<ProtectedRoute><RaceMonitor /></ProtectedRoute>} />
      <Route path="/race/:id/corrections" element={<RaceCorrections />} />
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