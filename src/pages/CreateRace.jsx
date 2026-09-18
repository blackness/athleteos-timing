import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const SPORT_OPTIONS = [
  'Cross Country',
  'Road Running',
  'Track & Field',
  'Triathlon',
  'Cycling',
  'Swimming',
  'Other',
]

const DISTANCE_OPTIONS = [
  '100m',
  '200m',
  '400m',
  '800m',
  '1500m',
  '1600m',
  '3000m',
  '3200m',
  '5K',
  '8K',
  '10K',
  'Half Marathon',
  'Marathon',
  'Sprint Triathlon',
  'Olympic Triathlon',
  'Custom',
]

function toDateInputValue(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export default function CreateRace() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const searchParams = new URLSearchParams(location.search)
  const parentEventId = searchParams.get('parentEventId')
  const copyRaceId = searchParams.get('copyRaceId')

  const [parentEvent, setParentEvent] = useState(null)
  const [sourceRace, setSourceRace] = useState(null)

  const [name, setName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [locationValue, setLocationValue] = useState('')
  const [distancePreset, setDistancePreset] = useState('')
  const [customDistance, setCustomDistance] = useState('')
  const [sport, setSport] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingParent, setLoadingParent] = useState(false)
  const [error, setError] = useState('')
  const [submitMode, setSubmitMode] = useState('setup')

  useEffect(() => {
    if (!parentEventId) return

    async function loadParentEvent() {
      setLoadingParent(true)

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', parentEventId)
        .single()

      setLoadingParent(false)

      if (error || !data) return

      setParentEvent(data)
      setEventDate(current => current || toDateInputValue(data.start_date || data.date))
      setLocationValue(current => current || data.location || '')
      setSport(current => current || data.sport || '')
    }

    loadParentEvent()
  }, [parentEventId])

  useEffect(() => {
    if (!copyRaceId) return

    async function loadSourceRace() {
      const { data, error } = await supabase
        .from('race_events')
        .select('*')
        .eq('id', copyRaceId)
        .single()

      if (error || !data) return

      setSourceRace(data)

      setEventDate(current => current || toDateInputValue(data.event_date))
      setLocationValue(current => current || data.location || '')
      setSport(current => current || data.sport || '')

      if (data.distance) {
        if (DISTANCE_OPTIONS.includes(data.distance)) {
          setDistancePreset(current => current || data.distance)
        } else {
          setDistancePreset(current => current || 'Custom')
          setCustomDistance(current => current || data.distance)
        }
      }
    }

    loadSourceRace()
  }, [copyRaceId])

  const distanceValue = useMemo(() => {
    return distancePreset === 'Custom' ? customDistance.trim() : distancePreset
  }, [distancePreset, customDistance])

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
        location: locationValue.trim() || null,
        distance: distanceValue || null,
        sport: sport || null,
        status: 'draft',
        user_id: user?.id || null,
        parent_event_id: parentEventId || null,
      })
      .select()
      .single()

    setSaving(false)

    if (error || !data) {
      setError(error?.message || 'Could not create race.')
      return
    }

    if (submitMode === 'event' && parentEventId) {
      navigate(`/event/${parentEventId}`)
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
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <button
          type="button"
          onClick={() => navigate(parentEventId ? `/event/${parentEventId}` : '/')}
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
          ← Back
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

          <div style={{ color: '#94a3b8', marginBottom: parentEvent || sourceRace ? 8 : 24 }}>
            {parentEvent
              ? `Adding a race to ${parentEvent.name}`
              : parentEventId && loadingParent
                ? 'Loading parent event…'
                : 'Create a standalone race or attach one to an event.'}
          </div>

          {sourceRace && (
            <div style={{ fontSize: 12, color: '#34d399', marginBottom: 10 }}>
              Based on: {sourceRace.name}
            </div>
          )}

          {parentEvent && (
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 24 }}>
              This will become the next race in your event. You can return to the event page and keep adding races after this.
            </div>
          )}

          <form onSubmit={handleCreate} style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={labelStyle}>Race Name *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Senior Boys 5K"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Event Date</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={e => setEventDate(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Sport</label>
                <select
                  value={sport}
                  onChange={e => setSport(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Select sport</option>
                  {SPORT_OPTIONS.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Location</label>
              <input
                value={locationValue}
                onChange={e => setLocationValue(e.target.value)}
                placeholder="City Park"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Distance</label>
              <select
                value={distancePreset}
                onChange={e => setDistancePreset(e.target.value)}
                style={inputStyle}
              >
                <option value="">Select distance</option>
                {DISTANCE_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            {distancePreset === 'Custom' && (
              <div>
                <label style={labelStyle}>Custom Distance</label>
                <input
                  value={customDistance}
                  onChange={e => setCustomDistance(e.target.value)}
                  placeholder="e.g. 2.5K or Super Sprint"
                  style={inputStyle}
                />
              </div>
            )}

            {error && (
              <div style={{ color: '#f87171', fontSize: 13 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="submit"
                disabled={saving}
                onClick={() => setSubmitMode('setup')}
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
                {saving && submitMode === 'setup' ? 'Creating…' : 'Create Race'}
              </button>

              {parentEventId && (
                <button
                  type="submit"
                  disabled={saving}
                  onClick={() => setSubmitMode('event')}
                  style={{
                    border: '1px solid #1e2730',
                    borderRadius: 10,
                    padding: '12px 16px',
                    fontWeight: 800,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    background: '#0b1220',
                    color: '#60a5fa',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving && submitMode === 'event' ? 'Creating…' : 'Create Race + Back to Event'}
                </button>
              )}
            </div>
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