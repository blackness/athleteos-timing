/**
 * RaceDay.jsx
 *
 * Route: /race/:id/time
 * Replace existing FinishLineTimer.jsx with this file.
 *
 * Split-screen race day interface:
 *  LEFT  — Finish line timer. Tap to record. Shows raw unassigned times.
 *  RIGHT — Live results. Bib assignment + inline editing of all fields.
 *          Syncs in real-time — works as one device or two.
 *
 * Module-level state survives navigation (timer keeps running).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ── module-level timer state (survives navigation) ─────────
let _startTime = null
let _running   = false

// ── helpers ────────────────────────────────────────────────
function fmt(ms, short = false) {
  if (ms == null) return short ? '--:--' : '--:--:--'
  const h  = Math.floor(ms / 3600000)
  const m  = Math.floor((ms % 3600000) / 60000)
  const s  = Math.floor((ms % 60000) / 1000)
  const cs = Math.floor((ms % 1000) / 10)
  if (short || h === 0) return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`
}

function fmtGap(ms) {
  if (!ms || ms <= 0) return 'Leader'
  const s = ms / 1000
  return s < 60 ? `+${s.toFixed(1)}s` : `+${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}`
}

const F  = "'Barlow Condensed', sans-serif"
const FB = "'Barlow', sans-serif"

// ── EditableCell ───────────────────────────────────────────
function EditableCell({ value, onChange, placeholder = '—', numeric = false, width }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value ?? '')
  const inputRef = useRef()

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])
  useEffect(() => { if (!editing) setDraft(value ?? '') }, [value, editing])

  const commit = () => {
    setEditing(false)
    if (draft !== (value ?? '')) onChange(draft)
  }

  if (editing) return (
    <input
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) } }}
      type={numeric ? 'number' : 'text'}
      style={{
        width: width ?? '100%', height: 24, background: '#1a2030', border: '1px solid #f97316',
        borderRadius: 4, color: '#f1f5f9', fontSize: 12, padding: '0 6px',
        fontFamily: FB, outline: 'none',
      }}
    />
  )

  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{
        cursor: 'text', display: 'inline-block', minWidth: 20,
        color: value ? '#e2e8f0' : '#2d3748',
        fontSize: 12, padding: '2px 4px', borderRadius: 3,
        borderBottom: '1px dashed #1e2730',
      }}
    >
      {value || placeholder}
    </span>
  )
}

// ── main component ─────────────────────────────────────────
export default function RaceDay() {
  const { id: eventId } = useParams()
  const navigate = useNavigate()

  const [running,   setRunning]   = useState(_running)
  const [elapsed,   setElapsed]   = useState(0)
  const [finishes,  setFinishes]  = useState([])
  const [entries,   setEntries]   = useState({}) // bib_number → entry
  const [event,     setEvent]     = useState(null)
  const [flash,     setFlash]     = useState(false)
  const [syncing,   setSyncing]   = useState(false)
  const [mobileTab, setMobileTab] = useState('timer') // 'timer' | 'results'

  const tickRef   = useRef(null)
  const placeRef  = useRef(1)
  const bottomRef = useRef(null)

  // ── load ──────────────────────────────────────────────────
  useEffect(() => {
    if (!eventId) return

    supabase.from('race_events').select('*').eq('id', eventId).single()
      .then(({ data }) => {
        setEvent(data)
        // Restore timer state if race already started
        if (data?.race_started_at && !_startTime) {
          _startTime = new Date(data.race_started_at).getTime()
          _running   = true
          setRunning(true)
        }
      })

    supabase.from('event_entries').select('*').eq('event_id', eventId)
      .then(({ data }) => {
        const map = {}
        data?.forEach(e => { map[e.bib_number] = e })
        setEntries(map)
      })

    supabase.from('race_finishes').select('*').eq('event_id', eventId)
      .order('place', { ascending: true })
      .then(({ data }) => {
        if (data?.length) {
          setFinishes(data)
          placeRef.current = data.length + 1
        }
      })

    const channel = supabase.channel(`raceday:${eventId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'race_finishes', filter: `event_id=eq.${eventId}` },
        p => setFinishes(prev => {
          if (prev.find(f => f.id === p.new.id)) return prev
          return [...prev, p.new].sort((a, b) => a.place - b.place)
        }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'race_finishes', filter: `event_id=eq.${eventId}` },
        p => setFinishes(prev => prev.map(f => f.id === p.new.id ? p.new : f)))
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [eventId])

  // ── clock ─────────────────────────────────────────────────
  useEffect(() => {
    if (running) {
      tickRef.current = setInterval(() => setElapsed(Date.now() - _startTime), 50)
    } else {
      clearInterval(tickRef.current)
    }
    return () => clearInterval(tickRef.current)
  }, [running])

  // ── actions ───────────────────────────────────────────────
  const startRace = useCallback(async () => {
    const now = Date.now()
    _startTime = now
    _running   = true
    setRunning(true)
    placeRef.current = finishes.length + 1
    // Persist start time so BibAssign and other devices can sync the clock
    await supabase.from('race_events').update({
      race_started_at: new Date(now).toISOString(),
      status: 'active',
    }).eq('id', eventId)
  }, [finishes.length, eventId])

  const recordFinish = useCallback(async () => {
    if (!running || !_startTime) return
    const raw_ms = Date.now() - _startTime
    const place  = placeRef.current++

    setFlash(true)
    setTimeout(() => setFlash(false), 150)

    const optimistic = {
      id: `opt-${Date.now()}`, event_id: eventId,
      place, time_ms: raw_ms, raw_ms,
      bib_number: null, source: 'manual',
      is_corrected: false, created_at: new Date().toISOString(),
    }
    setFinishes(prev => [...prev, optimistic])

    setSyncing(true)
    const { data, error } = await supabase.from('race_finishes').insert({
      event_id: eventId,
      place,
      time_ms: raw_ms,
      raw_ms,
      source: 'manual',
    }).select().single()
    setSyncing(false)
    if (error) {
      console.error('race_finishes insert failed:', error.message, error.details, error.hint)
      return
    }
    if (data) {
      setFinishes(prev => prev.map(f => f.id === optimistic.id ? data : f))
    }
  }, [running, eventId])

  // spacebar
  useEffect(() => {
    const h = e => { if (e.code === 'Space' && running && e.target.tagName !== 'INPUT') { e.preventDefault(); recordFinish() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [running, recordFinish])

  // ── inline field update ───────────────────────────────────
  const updateFinish = useCallback(async (id, field, value) => {
    // If updating bib_number, also look up entry
    let extra = {}
    if (field === 'bib_number') {
      extra.entry_id = entries[value]?.id ?? null
    }
    // Optimistic
    setFinishes(prev => prev.map(f => f.id === id ? { ...f, [field]: value || null, ...extra, is_corrected: true } : f))
    await supabase.from('race_finishes').update({ [field]: value || null, ...extra, is_corrected: true }).eq('id', id)
  }, [entries])

  // ── derived ───────────────────────────────────────────────
  const pending  = finishes.filter(f => !f.bib_number)
  const assigned = finishes.filter(f => f.bib_number)
  const leaderMs = assigned[0]?.time_ms ?? null

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  return (
    <div style={{ minHeight: '100dvh', background: '#080b0f', color: '#e2e8f0', fontFamily: FB, display: 'flex', flexDirection: 'column' }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #1a2030', background: '#0c1018', gap: 12, flexShrink: 0 }}>
        <button onClick={() => navigate(`/race/${eventId}/setup`)} style={{ background: 'none', border: '1px solid #1e2730', color: '#4a5568', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 11, fontFamily: F, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>← Setup</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: '#f97316', letterSpacing: 2, fontFamily: F, fontWeight: 700 }}>RACE DAY</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', fontFamily: F }}>{event?.name}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {syncing && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', animation: 'pulse 1s infinite' }} />}
          <button onClick={() => navigate(`/results/${eventId}`)} style={{ background: 'none', border: '1px solid #1e2730', color: '#60a5fa', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 11, fontFamily: F, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Live Results ↗</button>
        </div>
      </div>

      {/* Mobile tab switcher */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1a2030', background: '#0c1018' }}>
        {['timer', 'results'].map(tab => (
          <button key={tab} onClick={() => setMobileTab(tab)} style={{
            flex: 1, padding: '10px', border: 'none', background: 'none', cursor: 'pointer',
            fontFamily: F, fontWeight: 800, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase',
            color: mobileTab === tab ? '#f97316' : '#374151',
            borderBottom: mobileTab === tab ? '2px solid #f97316' : '2px solid transparent',
          }}>
            {tab === 'timer' ? `⏱ Timer${pending.length > 0 ? ` (${pending.length})` : ''}` : `📋 Results (${assigned.length})`}
          </button>
        ))}
      </div>

      {/* Main split */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT: Timer panel ─────────────────────────────── */}
        <div style={{
          width: '340px', flexShrink: 0, borderRight: '1px solid #1a2030',
          display: 'flex', flexDirection: 'column', background: '#080b0f',
          ...(mobileTab !== 'timer' ? { display: 'none' } : {}),
        }}
        // show on desktop always
        className="timer-panel"
        >
          {/* Clock */}
          <div style={{ padding: '20px 20px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: -3, color: running ? '#fff' : '#374151', fontVariantNumeric: 'tabular-nums', fontFamily: F, lineHeight: 1 }}>
              {fmt(elapsed)}
            </div>
            <div style={{ fontSize: 11, color: '#374151', marginTop: 4 }}>
              {running ? `${finishes.length} recorded · ${pending.length} awaiting bib` : 'Press START to begin'}
            </div>
          </div>

          {/* Big button */}
          <div style={{ padding: '0 16px 16px' }}>
            <button
              onPointerDown={running ? recordFinish : startRace}
              style={{
                width: '100%', height: 160, borderRadius: 20, border: 'none',
                background: flash ? '#22c55e' : running ? '#1d4ed8' : '#15803d',
                color: '#fff', fontSize: 32, fontWeight: 900, letterSpacing: 4,
                cursor: 'pointer', fontFamily: F, textTransform: 'uppercase',
                transform: flash ? 'scale(0.97)' : 'scale(1)',
                transition: 'background 0.06s, transform 0.06s',
                touchAction: 'manipulation',
              }}
            >
              {running ? 'FINISH' : 'START RACE'}
            </button>
            {running && <p style={{ textAlign: 'center', fontSize: 11, color: '#374151', marginTop: 8 }}>Tap · Spacebar · or use separate device at /race/{eventId}/assign</p>}
          </div>

          {/* Pending unassigned */}
          <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #0d1117' }}>
            <div style={{ padding: '8px 14px 4px', fontSize: 9, color: '#374151', textTransform: 'uppercase', letterSpacing: 2, fontFamily: F, fontWeight: 700 }}>
              Unassigned ({pending.length})
            </div>
            {pending.length === 0 && (
              <div style={{ padding: '20px 14px', color: '#1f2937', fontSize: 12, textAlign: 'center' }}>All finishes have bibs assigned</div>
            )}
            {pending.map((f, i) => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderBottom: '1px solid #0d1117', background: i === 0 ? '#0f1a0f' : 'transparent' }}>
                <span style={{ color: '#374151', width: 28, fontSize: 12, fontFamily: F }}># {f.place}</span>
                <span style={{ color: '#e2e8f0', fontWeight: 700, flex: 1, fontSize: 14, fontVariantNumeric: 'tabular-nums', fontFamily: F }}>{fmt(f.time_ms, true)}</span>
                <span style={{ fontSize: 10, background: i === 0 ? '#052e16' : '#111', color: i === 0 ? '#22c55e' : '#374151', padding: '2px 6px', borderRadius: 4, letterSpacing: 1, fontFamily: F, fontWeight: 700 }}>
                  {i === 0 ? 'NEXT' : 'queue'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Results panel ──────────────────────────── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          ...(mobileTab !== 'results' ? { display: 'none' } : {}),
        }}
        className="results-panel"
        >
          {/* Results header */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #1a2030', background: '#0c1018', gap: 12, flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: '#374151', textTransform: 'uppercase', letterSpacing: 2, fontFamily: F, fontWeight: 700 }}>Live Results — click bib to correct</div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 11, color: '#4a5568' }}>
              <span><span style={{ color: '#22c55e', fontWeight: 700 }}>{assigned.length}</span> assigned</span>
              <span><span style={{ color: '#f59e0b', fontWeight: 700 }}>{pending.length}</span> pending</span>
            </div>
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '36px 56px 96px 1fr 96px 30px 28px', gap: 0, padding: '6px 14px', borderBottom: '1px solid #1a2030', fontSize: 9, color: '#374151', textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: F, fontWeight: 700, flexShrink: 0 }}>
            <span>Pl</span><span>Bib</span><span>Time</span><span>Name</span><span>Team</span><span>Age</span><span>M/F</span>
          </div>

          {/* Rows */}
          <div style={{ flex: 1, overflowY: 'auto' }} ref={bottomRef}>
            {finishes.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#1f2937', padding: '48px 0', fontSize: 13 }}>
                {running ? 'Waiting for first finisher…' : 'Start the race to begin recording times'}
              </div>
            ) : (
              finishes.map((f, i) => {
                const entry     = f.bib_number ? entries[f.bib_number] : null
                const gap       = leaderMs != null && f.time_ms != null ? f.time_ms - leaderMs : null
                const medals    = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' }
                const isPending = !f.bib_number
                const name      = entry ? `${entry.first_name}${entry.last_name ? ' ' + entry.last_name : ''}` : null

                return (
                  <div key={f.id} style={{
                    display: 'grid', gridTemplateColumns: '36px 56px 96px 1fr 96px 30px 28px',
                    gap: 0, padding: '7px 14px', borderBottom: '1px solid #0d1117',
                    background: isPending ? '#0a0800' : i % 2 === 0 ? 'transparent' : '#0a0c10',
                    alignItems: 'center',
                    opacity: isPending ? 0.5 : 1,
                  }}>

                    {/* Place medal */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: medals[f.place] ?? '#1a2030', fontSize: 11, fontWeight: 800, color: medals[f.place] ? '#000' : '#4a5568', fontFamily: F }}>
                      {f.place}
                    </div>

                    {/* Bib — ONLY editable field */}
                    <div>
                      <EditableCell
                        value={f.bib_number ?? ''}
                        placeholder="—"
                        onChange={val => updateFinish(f.id, 'bib_number', val)}
                        width={44}
                      />
                      {f.is_corrected && <div style={{ fontSize: 8, color: '#f59e0b', letterSpacing: 1, fontFamily: F }}>EDITED</div>}
                    </div>

                    {/* Time — read only */}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', fontVariantNumeric: 'tabular-nums', fontFamily: F }}>{fmt(f.time_ms, true)}</div>
                      {gap != null && <div style={{ fontSize: 10, color: gap === 0 ? '#22c55e' : '#374151', fontVariantNumeric: 'tabular-nums' }}>{fmtGap(gap)}</div>}
                    </div>

                    {/* Name — from roster, read only */}
                    <div style={{ minWidth: 0, paddingRight: 8 }}>
                      <div style={{ fontSize: 13, color: name ? '#e2e8f0' : '#2d3748', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name ?? (isPending ? 'awaiting bib' : 'not in roster')}
                      </div>
                    </div>

                    {/* Team — read only */}
                    <div style={{ fontSize: 12, color: '#4a5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry?.team ?? '—'}
                    </div>

                    {/* Age — read only */}
                    <div style={{ fontSize: 12, color: '#4a5568' }}>
                      {entry?.age ?? '—'}
                    </div>

                    {/* Gender — read only */}
                    <div style={{ fontSize: 12, color: '#4a5568' }}>
                      {entry?.gender ?? '—'}
                    </div>

                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @media (min-width: 768px) {
          .timer-panel  { display: flex !important; }
          .results-panel { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
