import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export default function CreateRace() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [name, setName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [location, setLocation] = useState('')
  const [distance, setDistance] = useState('')
  const [type, setType] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e) {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Race name is required.')
      return
    }

    setSaving(true)

    const { data, error } = await supabase
      .from('race_events')
      .insert({
        name: name.trim(),
        event_date: eventDate || null,
        location: location.trim() || null,
        distance: distance.trim() || null,
        type: type.trim() || null,
        status: 'draft',
        user_id: user?.id || null,
      })
      .select()
      .single()

    setSaving(false)

    if (error || !data) {
      setError(error?.message || 'Could not create race.')
      return
    }

    navigate(`/race/${data.id}/setup`)
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#080b0f',
        color: '#e2e8f0',
        padding: 24,
      }}
    >
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
            Create Race
          </div>
          <div style={{ color: '#94a3b8', marginBottom: 24 }}>
            Start a new race, then continue setup from Race Home.
          </div>

          <form onSubmit={handleCreate} style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                Race Name *
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Senior Boys 5K"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                Event Date
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                Location
              </label>
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="City Park"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                Distance
              </label>
              <input
                value={distance}
                onChange={e => setDistance(e.target.value)}
                placeholder="5K"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                Type
              </label>
              <input
                value={type}
                onChange={e => setType(e.target.value)}
                placeholder="Cross Country"
                style={inputStyle}
              />
            </div>

            {error && (
              <div style={{ color: '#f87171', fontSize: 13 }}>
                {error}
              </div>
            )}

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
              {saving ? 'Creating…' : 'Create Race'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
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