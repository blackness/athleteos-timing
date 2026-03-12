import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

function formatDate(str) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDuration(ms) {
  if (!ms) return null
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}:${String(s).padStart(2,'0')}`
}

const SPORT_OPTIONS = ['Running', 'Cycling', 'Swimming', 'Triathlon', 'Duathlon', 'Cross Country', 'Track & Field', 'Other']
const DISTANCE_OPTIONS = ['400m', '800m', '1500m', '1 Mile', '3000m', '5K', '8K', '10K', '15K', 'Half Marathon', 'Marathon', '40K TT', 'Sprint Tri', 'Olympic Tri', '70.3', 'Custom']

export default function Events() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    name: '', sport: 'Running', distance: '5K',
    custom_distance: '', date: new Date().toISOString().split('T')[0],
    location: '', notes: ''
  })

  useEffect(() => { loadEvents() }, [])

  async function loadEvents() {
    setLoading(true)
    const { data } = await supabase
      .from('race_events')
      .select('*, race_finishes(count)')
      .eq('user_id', user.id)
      .order('event_date', { ascending: false })
    setEvents(data ?? [])
    setLoading(false)
  }

  async function createEvent() {
    if (!form.name.trim()) { setError('Event name is required'); return }
    setSaving(true)
    setError(null)
    const distance = form.distance === 'Custom' ? form.custom_distance : form.distance
    const { data, error: err } = await supabase
      .from('race_events')
      .insert({
        user_id: user.id,
        name: form.name.trim(),
        sport: form.sport,
        distance,
        event_date: form.date,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
      })
      .select()
      .single()
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowModal(false)
    resetForm()
    navigate(`/finish/${data.id}`)
  }

  function resetForm() {
    setForm({ name: '', sport: 'Running', distance: '5K', custom_distance: '', date: new Date().toISOString().split('T')[0], location: '', notes: '' })
    setError(null)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const statusColor = { active: '#22c55e', completed: '#6b7280', draft: '#f97316' }
  const statusLabel = { active: 'Live', completed: 'Done', draft: 'Draft' }

  return (
    <div style={{ minHeight: '100dvh', background: '#080b0f', fontFamily: "'Barlow', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:wght@300;400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        padding: '20px 20px 16px',
        background: 'linear-gradient(180deg, #0d1117 0%, #080b0f 100%)',
        borderBottom: '1px solid #1e2730',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#4a5568', letterSpacing: 3, textTransform: 'uppercase', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
            AthleteOS
          </div>
          <h1 style={{ color: '#f0f4f8', fontSize: 26, fontWeight: 900, margin: '2px 0 0', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: -0.5 }}>
            Race Timing
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#4a5568' }}>{profile?.full_name?.split(' ')[0]}</span>
          <button onClick={handleSignOut} style={{
            background: 'none', border: '1px solid #1e2730', borderRadius: 6,
            color: '#4a5568', fontSize: 12, fontWeight: 600, padding: '5px 12px',
            cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif', letterSpacing: 1, textTransform: 'uppercase'"
          }}>Sign Out</button>
        </div>
      </div>

      {/* New Event CTA */}
      <div style={{ padding: '16px 20px 0' }}>
        <button
          onClick={() => setShowModal(true)}
          style={{
            width: '100%', padding: '16px', borderRadius: 12,
            background: 'linear-gradient(135deg, #16a34a, #15803d)',
            border: 'none', color: '#fff', cursor: 'pointer',
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 18, fontWeight: 900, letterSpacing: 2,
            textTransform: 'uppercase',
            boxShadow: '0 4px 24px rgba(22,163,74,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10
          }}
        >
          <span style={{ fontSize: 20 }}>+</span> New Event
        </button>
      </div>

      {/* Events list */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ color: '#4a5568', textAlign: 'center', padding: '40px 0', fontSize: 14 }}>Loading...</div>
        ) : events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏁</div>
            <p style={{ color: '#4a5568', fontSize: 15, marginBottom: 8 }}>No events yet</p>
            <p style={{ color: '#2d3748', fontSize: 13 }}>Create your first event to start timing</p>
          </div>
        ) : (
          events.map(event => {
            const finisherCount = event.race_finishes?.[0]?.count ?? 0
            const isActive = event.status === 'active'
            return (
              <div key={event.id} style={{
                background: '#0e1318', borderRadius: 14,
                border: `1.5px solid ${isActive ? 'rgba(34,197,94,0.3)' : '#1e2730'}`,
                overflow: 'hidden',
                boxShadow: isActive ? '0 0 20px rgba(34,197,94,0.08)' : 'none'
              }}>
                <div style={{ padding: '16px 16px 12px' }}>
                  {/* Top row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        {isActive && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }} />
                            <span style={{ fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: '#22c55e', letterSpacing: 2, textTransform: 'uppercase' }}>Live</span>
                          </div>
                        )}
                        <span style={{
                          fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif",
                          fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
                          color: '#4a5568'
                        }}>
                          {event.sport} · {event.distance}
                        </span>
                      </div>
                      <div style={{ color: '#f0f4f8', fontSize: 18, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.3, lineHeight: 1.2 }}>
                        {event.name}
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                        <span style={{ color: '#4a5568', fontSize: 12 }}>{formatDate(event.event_date)}</span>
                        {event.location && <span style={{ color: '#4a5568', fontSize: 12 }}>📍 {event.location}</span>}
                        <span style={{ color: '#4a5568', fontSize: 12 }}>
                          {finisherCount} finisher{finisherCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', borderTop: '1px solid #1e2730' }}>
                  <button
                    onClick={() => navigate(`/finish/${event.id}`)}
                    style={{
                      flex: 2, padding: '12px 0',
                      background: isActive ? 'rgba(34,197,94,0.08)' : 'transparent',
                      border: 'none', cursor: 'pointer',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 13, fontWeight: 800, letterSpacing: 1.5,
                      textTransform: 'uppercase',
                      color: isActive ? '#22c55e' : '#f97316',
                      borderRight: '1px solid #1e2730'
                    }}
                  >
                    {isActive ? '▶ Resume' : '▶ Start Timing'}
                  </button>
                  <button
                    onClick={() => navigate(`/assign/${event.id}`)}
                    style={{
                      flex: 1, padding: '12px 0',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 13, fontWeight: 700, letterSpacing: 1,
                      textTransform: 'uppercase', color: '#4a5568',
                      borderRight: '1px solid #1e2730'
                    }}
                  >
                    Assign
                  </button>
                  <button
                    onClick={() => navigate(`/results/${event.id}`)}
                    style={{
                      flex: 1, padding: '12px 0',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 13, fontWeight: 700, letterSpacing: 1,
                      textTransform: 'uppercase', color: '#4a5568'
                    }}
                  >
                    Results
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* New Event Modal */}
      {showModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); resetForm() } }}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: '0'
          }}
        >
          <div style={{
            background: '#0e1318', borderRadius: '20px 20px 0 0',
            border: '1px solid #1e2730', borderBottom: 'none',
            width: '100%', maxWidth: 560,
            padding: '24px 24px 40px',
            maxHeight: '90dvh', overflowY: 'auto'
          }}>
            {/* Handle */}
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#1e2730', margin: '0 auto 20px' }} />

            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 900, color: '#f0f4f8', marginBottom: 20, letterSpacing: 0.5 }}>
              New Event
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Name */}
              <div>
                <label style={{ fontSize: 11, color: '#4a5568', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>
                  Event Name *
                </label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Tuesday Night 5K"
                  style={{ width: '100%', padding: '11px 14px', background: '#080b0f', border: '1.5px solid #1e2730', borderRadius: 8, color: '#f0f4f8', fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: "'Barlow', sans-serif" }}
                />
              </div>

              {/* Sport + Distance */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#4a5568', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>Sport</label>
                  <select
                    value={form.sport}
                    onChange={e => setForm(f => ({ ...f, sport: e.target.value }))}
                    style={{ width: '100%', padding: '11px 14px', background: '#080b0f', border: '1.5px solid #1e2730', borderRadius: 8, color: '#f0f4f8', fontSize: 14, outline: 'none', fontFamily: "'Barlow', sans-serif" }}
                  >
                    {SPORT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#4a5568', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>Distance</label>
                  <select
                    value={form.distance}
                    onChange={e => setForm(f => ({ ...f, distance: e.target.value }))}
                    style={{ width: '100%', padding: '11px 14px', background: '#080b0f', border: '1.5px solid #1e2730', borderRadius: 8, color: '#f0f4f8', fontSize: 14, outline: 'none', fontFamily: "'Barlow', sans-serif" }}
                  >
                    {DISTANCE_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              {/* Custom distance */}
              {form.distance === 'Custom' && (
                <div>
                  <label style={{ fontSize: 11, color: '#4a5568', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>Custom Distance</label>
                  <input
                    value={form.custom_distance}
                    onChange={e => setForm(f => ({ ...f, custom_distance: e.target.value }))}
                    placeholder="e.g. 12K, 25 Mile TT"
                    style={{ width: '100%', padding: '11px 14px', background: '#080b0f', border: '1.5px solid #1e2730', borderRadius: 8, color: '#f0f4f8', fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: "'Barlow', sans-serif" }}
                  />
                </div>
              )}

              {/* Date + Location */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#4a5568', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    style={{ width: '100%', padding: '11px 14px', background: '#080b0f', border: '1.5px solid #1e2730', borderRadius: 8, color: '#f0f4f8', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: "'Barlow', sans-serif", colorScheme: 'dark' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#4a5568', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>Location</label>
                  <input
                    value={form.location}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="Riverside Park"
                    style={{ width: '100%', padding: '11px 14px', background: '#080b0f', border: '1.5px solid #1e2730', borderRadius: 8, color: '#f0f4f8', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: "'Barlow', sans-serif" }}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label style={{ fontSize: 11, color: '#4a5568', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Wave times, categories, special instructions..."
                  rows={2}
                  style={{ width: '100%', padding: '11px 14px', background: '#080b0f', border: '1.5px solid #1e2730', borderRadius: 8, color: '#f0f4f8', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: "'Barlow', sans-serif", resize: 'vertical' }}
                />
              </div>

              <button
                onClick={createEvent}
                disabled={saving}
                style={{
                  width: '100%', padding: '15px', borderRadius: 10,
                  background: saving ? '#1e2730' : 'linear-gradient(135deg, #16a34a, #15803d)',
                  border: 'none', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 16, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase',
                  boxShadow: saving ? 'none' : '0 4px 20px rgba(22,163,74,0.3)',
                  marginTop: 4
                }}
              >
                {saving ? 'Creating...' : 'Create & Go to Finish Line →'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        input::placeholder { color: #2d3748; }
        input:focus, textarea:focus, select:focus { border-color: #f97316 !important; }
        ::-webkit-scrollbar { width: 4px; } 
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e2730; border-radius: 2px; }
      `}</style>
    </div>
  )
}
