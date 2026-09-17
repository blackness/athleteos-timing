import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export default function CreateEvent() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [location, setLocation] = useState('')
  const [sport, setSport] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e) {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Event name is required.')
      return
    }

    setSaving(true)

    const { data, error } = await supabase
      .from('events')
      .insert({
        name: name.trim(),
        start_date: startDate || null,
        end_date: endDate || null,
        location: location.trim() || null,
        sport: sport.trim() || null,
        user_id: user?.id || null,
      })
      .select()
      .single()

    setSaving(false)

    if (error || !data) {
      setError(error?.message || 'Could not create event.')
      return
    }

    navigate(`/create-race?parentEventId=${data.id}`)
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#080b0f', color: '#e2e8f0', padding: 24 }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{
            marginBottom: 20,
            background: 'none',
            border: '1px solid #1e2730',
            color: '#94a3b8',
            borderRadius: 8,
            padding: '8px 12px',
            cursor: 'pointer',
          }}
        >
          ← Back to Events
        </button>

        <div
          style={{
            background: '#0e1318',
            border: '1px solid #1a2030',
            borderRadius: 16,
            padding: 24,
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
            Create Event
          </div>
          <div style={{ color: '#94a3b8', marginBottom: 24 }}>
            Create a parent event, then add one or more races under it.
          </div>

          <form onSubmit={handleCreate} style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={labelStyle}>Event Name *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="City Endurance Festival 2026"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Location</label>
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="City Park"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Sport</label>
              <input
                value={sport}
                onChange={e => setSport(e.target.value)}
                placeholder="Track & Field"
                style={inputStyle}
              />
            </div>

            {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}

            <button
              type="submit"
              disabled={saving}
              style={{
                border: 'none',
                borderRadius: 10,
                padding: '12px 16px',
                fontWeight: 800,
                cursor: saving ? 'not-allowed' : 'pointer',
                background: '#f97316',
                color: '#fff',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Creating…' : 'Create Event'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  color: '#94a3b8',
  marginBottom: 6,
}

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  background: '#080b0f',
  border: '1px solid #1e2730',
  borderRadius: 10,
  color: '#e2e8f0',
  fontSize: 14,
  boxSizing: 'border-box',
}