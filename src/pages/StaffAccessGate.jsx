import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createStaffSession, getStaffRolePath, getStaffSession } from '../lib/staffAccess'

export default function StaffAccessGate() {
  const { accessCode } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState(null)
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    async function load() {
      setLoading(true)
      setError('')

      const existing = getStaffSession(accessCode)
      if (existing?.role) {
        navigate(getStaffRolePath(accessCode, existing.role), { replace: true })
        return
      }

      const { data, error } = await supabase.rpc('get_staff_access_public', {
        p_access_code: accessCode,
      })

      if (!mounted) return

      if (error) {
        setError(error.message || 'Could not load staff access.')
        setLoading(false)
        return
      }

      const row = Array.isArray(data) ? data[0] : null

      if (!row) {
        setError('Staff access link not found.')
        setLoading(false)
        return
      }

      setMeta(row)
      setLoading(false)
    }

    load()

    return () => {
      mounted = false
    }
  }, [accessCode, navigate])

  const submitPin = async e => {
    e.preventDefault()
    setError('')

    if (!/^\d{4}$/.test(pin)) {
      setError('Enter the 4-digit PIN.')
      return
    }

    setSubmitting(true)

    const { data, error } = await supabase.rpc('verify_staff_access_pin', {
      p_access_code: accessCode,
      p_pin_code: pin,
    })

    setSubmitting(false)

    if (error) {
      setError(error.message || 'Could not verify PIN.')
      return
    }

    const row = Array.isArray(data) ? data[0] : null

    if (!row?.ok || !row.role || !row.race_event_id) {
      setError('Incorrect PIN or inactive access.')
      return
    }

    createStaffSession({
      accessCode,
      role: row.role,
      raceEventId: row.race_event_id,
      raceName: row.race_name,
    })

    navigate(getStaffRolePath(accessCode, row.role), { replace: true })
  }

  const isExpired =
    meta?.expires_at && new Date(meta.expires_at).getTime() <= Date.now()

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>Loading staff access…</div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={eyebrowStyle}>Staff Access</div>
        <h1 style={titleStyle}>{meta?.race_name || 'Race Staff Access'}</h1>

        <div style={metaStyle}>
          <div>
            <strong>Role:</strong> {meta?.label || meta?.role || 'Staff'}
          </div>
          <div>
            <strong>Race Status:</strong> {meta?.race_status || '—'}
          </div>
        </div>

        {!meta?.is_active ? (
          <div style={errorBoxStyle}>This staff link is inactive.</div>
        ) : isExpired ? (
          <div style={errorBoxStyle}>This staff link has expired.</div>
        ) : (
          <form onSubmit={submitPin}>
            <label style={labelStyle}>Enter 4-digit PIN</label>

            <input
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              style={inputStyle}
              placeholder="0000"
              autoFocus
            />

            {error ? <div style={errorTextStyle}>{error}</div> : null}

            <button type="submit" disabled={submitting} style={buttonStyle}>
              {submitting ? 'Checking…' : 'Continue'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

const pageStyle = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#080b0f',
  color: '#e2e8f0',
  padding: 24,
}

const cardStyle = {
  width: '100%',
  maxWidth: 420,
  background: '#0e1318',
  border: '1px solid #1a2030',
  borderRadius: 16,
  padding: 24,
}

const eyebrowStyle = {
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 2,
  color: '#f97316',
  marginBottom: 8,
  fontWeight: 800,
}

const titleStyle = {
  margin: 0,
  fontSize: 28,
  marginBottom: 12,
}

const metaStyle = {
  fontSize: 14,
  color: '#94a3b8',
  marginBottom: 20,
  lineHeight: 1.6,
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 8,
  color: '#cbd5e1',
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '14px 16px',
  borderRadius: 10,
  border: '1px solid #1e2730',
  background: '#080b0f',
  color: '#e2e8f0',
  fontSize: 22,
  letterSpacing: 6,
  textAlign: 'center',
  marginBottom: 14,
  outline: 'none',
}

const buttonStyle = {
  width: '100%',
  border: 'none',
  borderRadius: 10,
  padding: '14px 16px',
  background: '#f97316',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
}

const errorBoxStyle = {
  background: '#2a0f13',
  border: '1px solid #7f1d1d',
  color: '#fca5a5',
  borderRadius: 12,
  padding: 12,
}

const errorTextStyle = {
  color: '#fca5a5',
  fontSize: 13,
  marginBottom: 12,
}