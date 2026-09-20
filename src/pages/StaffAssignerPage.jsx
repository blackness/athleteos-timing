import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import StaffRouteGuard from '../components/StaffRouteGuard'
import { clearStaffSession, getStaffSession } from '../lib/staffAccess'

function StaffAssignerInner() {
  const { accessCode } = useParams()
  const navigate = useNavigate()
  const session = getStaffSession(accessCode)

  const [race, setRace] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function load() {
      if (!session?.raceEventId) {
        if (!mounted) return
        setError('Missing race access session.')
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('race_events')
        .select('id, name, status')
        .eq('id', session.raceEventId)
        .single()

      if (!mounted) return

      if (error) {
        setError(error.message || 'Could not load race.')
        setLoading(false)
        return
      }

      setRace(data)
      setLoading(false)
    }

    load()

    return () => {
      mounted = false
    }
  }, [session?.raceEventId])

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={eyebrowStyle}>Staff Assigner</div>
        <h1 style={titleStyle}>{race?.name || session?.raceName || 'Race'}</h1>

        <div style={metaStyle}>
          <div><strong>Role:</strong> Assigner</div>
          <div><strong>Status:</strong> {race?.status || '—'}</div>
        </div>

        {loading ? <div style={noteStyle}>Loading…</div> : null}
        {error ? <div style={errorStyle}>{error}</div> : null}

        {!loading && !error ? (
          <>
            <div style={noteStyle}>
              This is the limited assigner access shell. Next step is to connect this role to the pending-finish bib assignment workflow only.
            </div>

            <div style={buttonRowStyle}>
              <button
                type="button"
                onClick={() => navigate(`/race/${session.raceEventId}/assign`)}
                style={primaryButtonStyle}
              >
                Open Bib Assignment
              </button>

              <button
                type="button"
                onClick={() => clearStaffSession(accessCode)}
                style={secondaryButtonStyle}
              >
                Sign Out Staff Access
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

export default function StaffAssignerPage() {
  return (
    <StaffRouteGuard allowedRole="assigner">
      <StaffAssignerInner />
    </StaffRouteGuard>
  )
}

const pageStyle = {
  minHeight: '100dvh',
  background: '#080b0f',
  color: '#e2e8f0',
  padding: 24,
}

const cardStyle = {
  maxWidth: 720,
  margin: '0 auto',
  background: '#0e1318',
  border: '1px solid #1a2030',
  borderRadius: 16,
  padding: 24,
}

const eyebrowStyle = {
  fontSize: 12,
  color: '#f97316',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: 2,
  marginBottom: 8,
}

const titleStyle = {
  margin: 0,
  marginBottom: 8,
  fontSize: 28,
}

const metaStyle = {
  color: '#94a3b8',
  marginBottom: 16,
  lineHeight: 1.6,
}

const noteStyle = {
  color: '#cbd5e1',
  marginBottom: 20,
  lineHeight: 1.6,
}

const errorStyle = {
  background: '#2a0f13',
  border: '1px solid #7f1d1d',
  color: '#fca5a5',
  borderRadius: 12,
  padding: 12,
  marginBottom: 16,
}

const buttonRowStyle = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
}

const primaryButtonStyle = {
  border: 'none',
  borderRadius: 10,
  padding: '12px 16px',
  background: '#f97316',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
}

const secondaryButtonStyle = {
  border: '1px solid #1e2730',
  borderRadius: 10,
  padding: '12px 16px',
  background: '#0b1220',
  color: '#60a5fa',
  fontWeight: 700,
  cursor: 'pointer',
}