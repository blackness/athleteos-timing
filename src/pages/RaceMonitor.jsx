import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getRaceElapsedMs, formatRaceClock } from '../lib/raceClock'

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
const fontMono = "'JetBrains Mono', 'SF Mono', monospace"

function fmtTime(ms) {
  if (ms == null) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const cs = Math.floor((ms % 1000) / 10)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function fmtAgo(ts) {
  if (!ts) return '—'
  const diff = Math.max(0, Date.now() - new Date(ts).getTime())
  const s = Math.floor(diff / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}

export default function RaceMonitor() {
  const { id: eventId } = useParams()
  const navigate = useNavigate()

  const [event, setEvent] = useState(null)
  const [checkpoints, setCheckpoints] = useState([])
  const [entriesCount, setEntriesCount] = useState(0)
  const [lapEvents, setLapEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (event?.status !== 'active') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [event?.status])

  const raceElapsedMs = getRaceElapsedMs(event, now)

  useEffect(() => {
    if (!eventId) return

    async function load() {
      setLoading(true)

      const [
        { data: eventData },
        { data: checkpointData },
        { data: lapData },
        { count },
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
          .select('*')
          .eq('event_id', eventId),
        supabase
          .from('event_entries')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', eventId),
      ])

      setEvent(eventData || null)
      setCheckpoints(checkpointData || [])
      setLapEvents(lapData || [])
      setEntriesCount(count || 0)
      setLoading(false)
    }

    load()

    const ch = supabase
      .channel(`race-monitor:${eventId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'race_events', filter: `id=eq.${eventId}` },
        payload => setEvent(payload.new)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lap_events', filter: `event_id=eq.${eventId}` },
        async () => {
          const { data } = await supabase
            .from('lap_events')
            .select('*')
            .eq('event_id', eventId)

          setLapEvents(data || [])
        }
      )
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [eventId])

  const stats = useMemo(() => {
    const byCheckpoint = {}

    checkpoints.forEach(cp => {
      byCheckpoint[cp.id] = {
        checkpoint: cp,
        total: 0,
        pending: 0,
        assigned: 0,
        void: 0,
        lastCapturedAt: null,
        lastBib: null,
        lastElapsedMs: null,
      }
    })

    lapEvents.forEach(l => {
      const bucket = byCheckpoint[l.checkpoint_id]
      if (!bucket) return

      bucket.total += 1
      if (l.status === 'pending') bucket.pending += 1
      else if (l.status === 'assigned') bucket.assigned += 1
      else if (l.status === 'void') bucket.void += 1

      if (!bucket.lastCapturedAt || new Date(l.captured_at) > new Date(bucket.lastCapturedAt)) {
        bucket.lastCapturedAt = l.captured_at
        bucket.lastBib = l.bib_number || null
        bucket.lastElapsedMs = l.elapsed_ms ?? null
      }
    })

    return checkpoints.map(cp => byCheckpoint[cp.id])
  }, [checkpoints, lapEvents])

  const overall = useMemo(() => {
    return {
      total: lapEvents.length,
      assigned: lapEvents.filter(l => l.status === 'assigned').length,
      pending: lapEvents.filter(l => l.status === 'pending').length,
      void: lapEvents.filter(l => l.status === 'void').length,
    }
  }, [lapEvents])

  const copyText = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 1200)
    } catch {
      // ignore
    }
  }

  const raceStatusLabel =
    event?.status === 'active'
      ? { text: 'LIVE', color: C.red }
      : event?.status === 'finished'
        ? { text: 'FINISHED', color: C.muted }
        : { text: 'NOT STARTED', color: C.yellow }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: C.bg, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fontBody }}>
        Loading monitor…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, color: C.text, fontFamily: fontBody }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '14px 20px' }}>
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            gap: 20,
          }}
        >
          {/* Left */}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 9, color: C.orange, letterSpacing: 3, fontFamily: fontHead, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
              AthletOS · Race Monitor
            </div>

            <div style={{ fontSize: 24, fontWeight: 900, fontFamily: fontHead, letterSpacing: 0.5, marginBottom: 4, color: C.text }}>
              {event?.name ?? 'Race'}
            </div>

            <div style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {event?.distance && <span>{event.distance}</span>}
              {event?.location && <span>📍 {event.location}</span>}
              {event?.event_date && (
                <span>
                  {new Date(event.event_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              )}
            </div>
          </div>

          {/* Center Clock */}
          <div style={{ textAlign: 'center', minWidth: 260 }}>
            <div
              style={{
                fontSize: 10,
                color: raceStatusLabel.color,
                textTransform: 'uppercase',
                letterSpacing: 2.5,
                fontFamily: fontHead,
                fontWeight: 800,
                marginBottom: 4,
              }}
            >
              {event?.status === 'active'
                ? 'Race Clock'
                : event?.status === 'finished'
                  ? 'Final Time'
                  : 'Waiting For Start'}
            </div>

            <div
              style={{
                fontSize: 'clamp(44px, 6vw, 72px)',
                lineHeight: 1,
                fontWeight: 900,
                letterSpacing: -2,
                fontFamily: fontHead,
                color: event?.race_started_at ? C.text : '#374151',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatRaceClock(raceElapsedMs)}
            </div>

            <div style={{ marginTop: 4, fontSize: 11, color: C.muted }}>
              {event?.race_started_at
                ? event?.status === 'finished' && event?.race_finished_at
                  ? `Start ${new Date(event.race_started_at).toLocaleTimeString()} · Finish ${new Date(event.race_finished_at).toLocaleTimeString()}`
                  : `Start ${new Date(event.race_started_at).toLocaleTimeString()}`
                : 'Race not started'}
            </div>
          </div>

          {/* Right */}
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

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                onClick={() => navigate(`/race/${eventId}/setup`)}
                style={navBtn(C.muted, C.border)}
              >
                ← Setup
              </button>

              <button
                onClick={() => navigate(`/race/${eventId}/checkpoints`)}
                style={navBtn(C.orange, C.border)}
              >
                Checkpoints
              </button>

              <button
                onClick={() => navigate(`/race/${eventId}/checkpoint-qr`)}
                style={navBtn(C.orange, C.border)}
              >
                QR Sheet
              </button>

              <button
                onClick={() => navigate(`/results/${eventId}`)}
                style={navBtn(C.blue, C.border)}
              >
                Live Results ↗
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
          }}
        >
          {[
            { label: 'Checkpoints', value: checkpoints.length, color: C.text },
            { label: 'Entries', value: entriesCount, color: C.muted },
            { label: 'Assigned', value: overall.assigned, color: C.green },
            { label: 'Pending', value: overall.pending, color: overall.pending > 0 ? C.yellow : C.muted },
            { label: 'Void', value: overall.void, color: overall.void > 0 ? C.red : C.muted },
            { label: 'Total taps', value: overall.total, color: C.muted },
          ].map((s, idx, arr) => (
            <div
              key={s.label}
              style={{
                padding: '10px 12px',
                borderRight: idx < arr.length - 1 ? `1px solid ${C.border}` : 'none',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 900, fontFamily: fontHead, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
        <div style={{ fontFamily: fontHead, fontSize: 11, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>
          Live checkpoint activity
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {stats.map(({ checkpoint: cp, total, pending, assigned, void: voidCount, lastCapturedAt, lastBib, lastElapsedMs }) => {
            const quickCode = cp.short_code || cp.id
            const quickUrl = `${window.location.origin}/c/${quickCode}`

            return (
              <div
                key={cp.id}
                style={{
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 14,
                  padding: 18,
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

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <span style={{ fontSize: 10, fontFamily: fontHead, fontWeight: 700, letterSpacing: 1.5, color: C.blue, textTransform: 'uppercase', padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.border}` }}>
                      {quickCode}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <StatMini label="Assigned" value={assigned} color={C.green} />
                  <StatMini label="Pending" value={pending} color={pending > 0 ? C.yellow : C.muted} />
                  <StatMini label="Void" value={voidCount} color={voidCount > 0 ? C.red : C.muted} />
                  <StatMini label="Total" value={total} color={C.muted} />
                </div>

                <div style={{ background: C.surface2, borderRadius: 10, padding: 12, marginBottom: 14 }}>
                  <InfoRow label="Last activity" value={lastCapturedAt ? fmtAgo(lastCapturedAt) : '—'} />
                  <InfoRow label="Last time" value={lastElapsedMs != null ? fmtTime(lastElapsedMs) : '—'} mono />
                  <InfoRow label="Last bib" value={lastBib || '—'} mono />
                </div>

                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                  <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: fontHead, fontWeight: 700, marginBottom: 6 }}>
                    Quick Link
                  </div>
                  <div style={{ fontSize: 12, color: C.blue, wordBreak: 'break-all', marginBottom: 10 }}>
                    {quickUrl}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => navigate(`/race/${eventId}/checkpoint/${cp.id}`)}
                      style={actionBtn(C.orange)}
                    >
                      Open Timer
                    </button>

                    <button
                      onClick={() => copyText(quickUrl, cp.id)}
                      style={ghostBtn(copied === cp.id ? C.green : C.blue)}
                    >
                      {copied === cp.id ? 'Copied' : 'Copy Link'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function navBtn(color, borderColor) {
  return {
    background: 'none',
    border: `1px solid ${borderColor}`,
    color,
    borderRadius: 8,
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: fontHead,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  }
}

function actionBtn(bg) {
  return {
    background: bg,
    border: 'none',
    color: '#fff',
    borderRadius: 8,
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: fontHead,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  }
}

function ghostBtn(color) {
  return {
    background: 'none',
    border: `1px solid #1e2730`,
    color,
    borderRadius: 8,
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: fontHead,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  }
}

function StatMini({ label, value, color }) {
  return (
    <div style={{ background: '#141920', borderRadius: 10, padding: '10px 10px' }}>
      <div style={{ fontSize: 20, fontWeight: 900, fontFamily: fontHead, color }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 1.5 }}>
        {label}
      </div>
    </div>
  )
}

function InfoRow({ label, value, mono = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
      <span style={{ fontSize: 11, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 1, fontFamily: fontHead }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: '#f0f4f8', fontFamily: mono ? fontMono : fontBody }}>
        {value}
      </span>
    </div>
  )
}