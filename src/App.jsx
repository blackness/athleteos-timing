import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { useAuth } from './hooks/useAuth'

import Login from './pages/Login'
import Events from './pages/Events'
import PublicHome from './pages/PublicHome'
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
import ResultsCorrectionsPage from './pages/ResultsCorrectionsPage'
import RaceLiveBoard from './pages/RaceLiveBoard'
import CreateRace from './pages/CreateRace'
import CreateEvent from './pages/CreateEvent'
import EventResultsPage from './pages/EventResultsPage'
import RaceHomeRedirect from './pages/RaceHomeRedirect'
import RaceDirectorPage from './pages/RaceDirectorPage'
import StaffAccessGate from './pages/StaffAccessGate'
import StaffTimerPage from './pages/StaffTimerPage'
import StaffAssignerPage from './pages/StaffAssignerPage'
import StaffMonitorPage from './pages/StaffMonitorPage'
//import { Analytics } from '@vercel/analytics/react'

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

function HomeRoute() {
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

  return user ? <Events /> : <PublicHome />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Public spectator routes */}
      <Route path="/" element={<HomeRoute />} />
      <Route path="/public" element={<PublicHome />} />
      <Route path="/results/:id" element={<LiveResults />} />
      <Route path="/public/race/:id/live-board" element={<RaceLiveBoard />} />
      <Route path="/event/:id" element={<EventResultsPage />} />

      {/* Staff/device redirect entry */}
      <Route path="/c/:code" element={<CheckpointRedirect />} />

      {/* Staff access routes */}
      <Route path="/staff/:accessCode" element={<StaffAccessGate />} />
      <Route path="/staff/:accessCode/timer" element={<StaffTimerPage />} />
      <Route path="/staff/:accessCode/assigner" element={<StaffAssignerPage />} />
      <Route path="/staff/:accessCode/monitor" element={<StaffMonitorPage />} />

      {/* Protected staff routes */}
      <Route path="/create-race" element={<ProtectedRoute><CreateRace /></ProtectedRoute>} />
      <Route path="/create-event" element={<ProtectedRoute><CreateEvent /></ProtectedRoute>} />
      <Route path="/cv/:id" element={<ProtectedRoute><CVDashboard /></ProtectedRoute>} />
      <Route path="/race/:id" element={<ProtectedRoute><RaceHomeRedirect /></ProtectedRoute>} />
      <Route path="/race/:id/setup" element={<ProtectedRoute><PreRaceSetup /></ProtectedRoute>} />
      <Route path="/race/:id/checkpoints" element={<ProtectedRoute><CheckpointSelect /></ProtectedRoute>} />
      <Route path="/race/:id/checkpoint-qr" element={<ProtectedRoute><CheckpointQrSheet /></ProtectedRoute>} />
      <Route path="/race/:id/time" element={<ProtectedRoute><RaceDay /></ProtectedRoute>} />
      <Route path="/race/:id/assign" element={<ProtectedRoute><BibAssign /></ProtectedRoute>} />
      <Route path="/race/:id/monitor" element={<ProtectedRoute><RaceMonitor /></ProtectedRoute>} />
      <Route path="/race/:id/corrections" element={<ProtectedRoute><RaceCorrections /></ProtectedRoute>} />
      <Route path="/race/:id/checkpoint/:checkpointId" element={<ProtectedRoute><CheckpointTimer /></ProtectedRoute>} />
      <Route path="/race/:id/results/resultscorrectionspage" element={<ProtectedRoute><ResultsCorrectionsPage /></ProtectedRoute>} />
      <Route path="/race/:id/director" element={<ProtectedRoute><RaceDirectorPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  )
}