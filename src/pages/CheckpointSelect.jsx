import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const C = {
  bg: '#080b0f',
  surface: '#0e1318',
  surface2: '#141920',
  border: '#1e2730',
  text: '#f0f4f8',
  muted: '#4a5568',
  orange: '#f97316',
  green: '#10b981',
  blue: '#3b82f6',
  yellow: '#eab308',
  red: '#ef4444',
}

const fontHead = "'Barlow Condensed', sans-serif"
const fontBody = "'Barlow', sans-serif"

export default function CheckpointSelect() {
  const { id: eventId } = useParams()
  const navigate = useNavigate()

  const [event, setEvent] = useState(null)
  const [checkpoints, setCheckpoints] = useState([])
  const [lapCounts, setLapCounts] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!eventId) return

    async function load() {
      setLoading(true)

      const [
        { data: eventData },
        { data: checkpointData },
        { data: lapData },
      ] = await Promise.all([
        supabase.from('race_events').select('*').eq('id', eventId).single(),
        supabase
          .from('race_checkpoints')
          .select('*')
          .eq('event_id', eventId)
          .eq('is_active', true)
          .order('checkpoint_order', { ascending: true }),
        supabase
          .from('lap_events')
          .select('id, checkpoint_id, status')
          .eq('event_id', eventId),
      ])

      setEvent(eventData || null)
      setCheckpoints(checkpointData || [])

      const counts = {}
      ;(lapData || []).forEach(l => {
        if (!counts[l.checkpoint_id]) {
          counts[l.checkpoint_id] = { total: 0, pending: 0, assigned: 0 }
        }
        counts[l.checkpoint_id].total += 1
        if (l.status === 'assigned') counts[l.checkpoint_id].assigned += 1
        if (l.status === 'pending') counts[l.checkpoint_id].pending += 1
      })
      setLapCounts(counts)

      setLoading(false)
    }

    load()

    const ch = supabase
      .channel(`checkpoint-select:${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lap_events', filter: `event_id=eq.${eventId}` },
        () => {
          supabase
            .from('lap_events')
            .select('id, checkpoint_id, status')
            .eq('event_id', eventId)
            .then(({ data }) => {
              const counts = {}
              ;(data || []).forEach(l => {
                if (!counts[l.checkpoint_id]) {
                  counts[l.checkpoint_id] = { total: 0, pending: 0, assigned: 0 }
                }
                counts[l.checkpoint_id].total += 1
                if (l.status === 'assigned') counts[l.checkpoint_id].assigned += 1
                if (l.status === 'pending') counts[l.checkpoint_id].pending += 1
              })
              setLapCounts(counts)
            })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'race_events', filter: `id=eq.${eventId}` },
        payload => setEvent(payload.new)
      )
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [eventId])

  const raceStatusLabel =
    event?.status === 'active'
      ? { text: 'LIVE', color: C.red || '#ef4444' }
      : event?.status === 'finished'
        ? { text: 'FINISHED', color: C.muted }
        : { text: 'NOT STARTED', color: C.yellow }

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, color: C.text, fontFamily: fontBody }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '14px 20px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 9, color: C.orange, letterSpacing: 3, fontFamily: fontHead, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
              AthletOS · Checkpoint Selection
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, fontFamily: fontHead, letterSpacing: 0.5, marginBottom: 4 }}>
              {event?.name ?? 'Loading…'}
            </div>
            <div style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {event?.distance && <span>{event.distance}</span>}
              {event?.location && <span>📍 {event.location}</span>}
              {event?.event_date && (
                <span>
                  {new Date(event.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 10,
                fontWeight: 700,
                color: raceStatusLabel.color,
                letterSpacing: 2,
                fontFamily: fontHead,
                textTransform: 'uppercase',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: raceStatusLabel.color, display: 'inline-block' }} />
              {raceStatusLabel.text}
            </span>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => navigate(`/race/${eventId}/setup`)}
                style={{
                  background: 'none',
                  border: `1px solid ${C.border}`,
                  color: C.muted,
                  borderRadius: 8,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: fontHead,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                ← Setup
              </button>

              <button
                onClick={() => navigate(`/results/${eventId}`)}
                style={{
                  background: 'none',
                  border: `1px solid ${C.border}`,
                  color: C.blue,
                  borderRadius: 8,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: fontHead,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                Live Results ↗
              </button>
              <button
                onClick={() => navigate(`/race/${eventId}/checkpoint-qr`)}
                style={{
                  background: 'none',
                  border: `1px solid ${C.border}`,
                  color: C.orange,
                  borderRadius: 8,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: fontHead,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                Print QR Sheet
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap' }}>
          {[
            { label: 'Checkpoints', value: checkpoints.length, color: C.text },
            { label: 'Entries', value: '—', color: C.muted },
            {
              label: 'Assigned splits',
              value: Object.values(lapCounts).reduce((sum, c) => sum + c.assigned, 0),
              color: C.green,
            },
            {
              label: 'Pending splits',
              value: Object.values(lapCounts).reduce((sum, c) => sum + c.pending, 0),
              color: Object.values(lapCounts).reduce((sum, c) => sum + c.pending, 0) > 0 ? C.yellow : C.muted,
            },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, minWidth: 160, padding: '10px 20px', borderRight: `1px solid ${C.border}`, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: fontHead, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px' }}>
        <div style={{ fontFamily: fontHead, fontSize: 11, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>
          Select a checkpoint to begin timing
        </div>

        {loading ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '40px 0', textAlign: 'center', color: C.muted }}>
            Loading checkpoints…
          </div>
        ) : checkpoints.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '40px 20px', textAlign: 'center', color: C.muted }}>
            No checkpoints configured yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {checkpoints.map(cp => {
              const counts = lapCounts[cp.id] || { total: 0, pending: 0, assigned: 0 }

              return (
                <button
                  key={cp.id}
                  onClick={() => navigate(`/race/${eventId}/checkpoint/${cp.id}`)}
                  style={{
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: 14,
                    padding: 18,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'transform 0.12s ease, border-color 0.12s ease, background 0.12s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.borderColor = C.orange
                    e.currentTarget.style.background = C.surface2
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.borderColor = C.border
                    e.currentTarget.style.background = C.surface
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: C.orange, letterSpacing: 2, fontFamily: fontHead, fontWeight: 700, textTransform: 'uppercase' }}>
                        Checkpoint {cp.checkpoint_order}
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 900, fontFamily: fontHead, color: C.text, marginTop: 4 }}>
                        {cp.name}
                      </div>
                    </div>

                    {cp.code && (
                      <span style={{ fontSize: 10, fontFamily: fontHead, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: 'uppercase', padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.border}` }}>
                        {cp.code}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    <div style={{ background: C.surface2, borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 20, fontWeight: 900, fontFamily: fontHead, color: C.green }}>
                        {counts.assigned}
                      </div>
                      <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                        Assigned
                      </div>
                    </div>

                    <div style={{ background: C.surface2, borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 20, fontWeight: 900, fontFamily: fontHead, color: counts.pending > 0 ? C.yellow : C.muted }}>
                        {counts.pending}
                      </div>
                      <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                        Pending
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: C.muted, fontSize: 12 }}>
                    <span>{counts.total} total taps</span>
                    <span style={{ fontFamily: fontHead, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: C.orange }}>
                      Open →
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', color: '#1f2937', fontSize: 11, padding: '24px 0', letterSpacing: 1, fontFamily: fontHead }}>
        POWERED BY ATHLETOS
      </div>
    </div>
  )
}