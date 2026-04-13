/**
 * BibAssign.jsx  — Bib Caller companion to RaceDay
 *
 * Route: /race/:id/assign
 *
 * Shows the same data as RaceDay in real-time so both operators
 * are always in sync. Left column = unassigned finishes to work
 * through. Right column = full results as they build up.
 *
 * The live clock is driven by the race start time stored in
 * Supabase on the race_events row (set when RaceDay starts).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ── helpers ────────────────────────────────────────────────
function fmt(ms, short = false) {
  if (ms == null) return short ? '--:--' : '--:--:--'
  const h  = Math.floor(ms / 3600000)
  const m  = Math.floor((ms % 3600000) / 60000)
  const s  = Math.floor((ms % 60000) / 1000)
  const cs = Math.floor((ms % 1000) / 10)
  if (short || h === 0)
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`
}

function fmtGap(ms) {
  if (!ms || ms <= 0) return 'Leader'
  const s = ms / 1000
  return s < 60 ? `+${s.toFixed(1)}s` : `+${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}`
}

const F  = "'Barlow Condensed', sans-serif"
const FB = "'Barlow', sans-serif"

export default function BibAssign() {
  const { id: eventId } = useParams()
  const navigate = useNavigate()

  const [event,     setEvent]     = useState(null)
  const [finishes,  setFinishes]  = useState([])
  const [entries,   setEntries]   = useState({}) // bib_number → entry
  const [elapsed,   setElapsed]   = useState(0)
  const [raceStart, setRaceStart] = useState(null) // epoch ms from DB

  const [bibInput,  setBibInput]  = useState('')
  const [preview,   setPreview]   = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [flashId,   setFlashId]   = useState(null)

  const inputRef = useRef(null)
  const tickRef  = useRef(null)

  // ── load ──────────────────────────────────────────────────
  useEffect(() => {
    if (!eventId) return

    // Load event — race_started_at tells us when the clock started
    supabase.from('race_events').select('*').eq('id', eventId).single()
      .then(({ data }) => {
        setEvent(data)
        if (data?.race_started_at) {
          setRaceStart(new Date(data.race_started_at).getTime())
        }
      })

    // Load roster
    supabase.from('event_entries').select('*').eq('event_id', eventId)
      .then(({ data }) => {
        const map = {}
        data?.forEach(e => { map[e.bib_number] = e })
        setEntries(map)
      })

    // Load finishes
    supabase.from('race_finishes').select('*').eq('event_id', eventId)
      .order('place', { ascending: true })
      .then(({ data }) => setFinishes(data ?? []))

    // Real-time: new finishes from timekeeper + bib updates
    const channel = supabase.channel(`bibassign:${eventId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'race_finishes', filter: `event_id=eq.${eventId}` },
        p => setFinishes(prev => {
          if (prev.find(f => f.id === p.new.id)) return prev
          return [...prev, p.new].sort((a, b) => a.place - b.place)
        }))
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'race_finishes', filter: `event_id=eq.${eventId}` },
        p => setFinishes(prev => prev.map(f => f.id === p.new.id ? p.new : f)))
      // Watch for race start time being set
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'race_events', filter: `id=eq.${eventId}` },
        p => {
          if (p.new.race_started_at) setRaceStart(new Date(p.new.race_started_at).getTime())
        })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [eventId])

  // ── clock ─────────────────────────────────────────────────
  useEffect(() => {
    if (!raceStart) return
    tickRef.current = setInterval(() => setElapsed(Date.now() - raceStart), 50)
    return () => clearInterval(tickRef.current)
  }, [raceStart])

  // ── bib preview ───────────────────────────────────────────
  useEffect(() => {
    const bib = bibInput.trim()
    if (!bib) { setPreview(null); return }
    const entry = entries[bib]
    setPreview(entry
      ? { found: true, name: `${entry.first_name}${entry.last_name ? ' ' + entry.last_name : ''}`, team: entry.team }
      : { found: false }
    )
  }, [bibInput, entries])

  // Keep input focused when queue changes
  useEffect(() => { inputRef.current?.focus() }, [finishes.length])

  // ── derived ───────────────────────────────────────────────
  const pending  = finishes.filter(f => !f.bib_number)
  const assigned = finishes.filter(f => f.bib_number)
  const leaderMs = assigned[0]?.time_ms ?? null

  // ── assign bib ────────────────────────────────────────────
  const assignBib = useCallback(async () => {
    const bib = bibInput.trim()
    if (!bib || saving || pending.length === 0) return
    const target = pending[0]

    setSaving(true)
    const entry = entries[bib]
    const { error } = await supabase
      .from('race_finishes')
      .update({ bib_number: bib, entry_id: entry?.id ?? null })
      .eq('id', target.id)
    setSaving(false)

    if (!error) {
      setFlashId(target.id)
      setTimeout(() => setFlashId(null), 800)
      setLastSaved({
        place: target.place, bib,
        name: entry ? `${entry.first_name}${entry.last_name ? ' ' + entry.last_name : ''}` : null,
        time: fmt(target.time_ms, true),
      })
      setBibInput('')
      setPreview(null)
      inputRef.current?.focus()
    }
  }, [bibInput, saving, pending, entries])

  return (
    <div style={{ minHeight: '100dvh', background: '#080b0f', color: '#e2e8f0', fontFamily: FB, display: 'flex', flexDirection: 'column' }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #1a2030', background: '#0c1018', gap: 12, flexShrink: 0 }}>
        <button
          onClick={() => navigate(`/race/${eventId}/time`)}
          style={{ background: 'none', border: '1px solid #1e2730', color: '#4a5568', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 11, fontFamily: F, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}
        >
          ← Timer
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: '#f59e0b', letterSpacing: 2, fontFamily: F, fontWeight: 700 }}>BIB CALLER</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', fontFamily: F }}>{event?.name}</div>
        </div>
        {/* Live clock */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, color: raceStart ? '#fff' : '#374151', fontVariantNumeric: 'tabular-nums', fontFamily: F, lineHeight: 1 }}>
            {fmt(elapsed)}
          </div>
          <div style={{ fontSize: 9, color: '#374151', letterSpacing: 1, textTransform: 'uppercase' }}>
            {raceStart ? 'Race clock' : 'Not started'}
          </div>
        </div>
      </div>

      {/* Main split */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT: Bib entry + pending queue ───────────────── */}
        <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #1a2030', display: 'flex', flexDirection: 'column', background: '#080b0f' }}>

          {/* Entry card */}
          <div style={{ padding: 16, borderBottom: '1px solid #1a2030' }}>
            <div style={{ fontSize: 9, color: '#374151', textTransform: 'uppercase', letterSpacing: 2, fontFamily: F, fontWeight: 700, marginBottom: 10 }}>
              {pending.length > 0
                ? `Assign bib — place #${pending[0].place} · ${fmt(pending[0].time_ms, true)}`
                : assigned.length > 0 ? 'All caught up — waiting…' : 'Waiting for finishers…'}
            </div>

            {/* Athlete preview */}
            <div style={{ minHeight: 18, marginBottom: 8, fontSize: 12 }}>
              {preview?.found && (
                <span style={{ color: '#22c55e' }}>✓ {preview.name}{preview.team ? ` · ${preview.team}` : ''}</span>
              )}
              {preview && !preview.found && (
                <span style={{ color: '#f59e0b' }}>⚠ Not in roster</span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                type="number"
                inputMode="numeric"
                value={bibInput}
                onChange={e => setBibInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') assignBib() }}
                placeholder="Bib #"
                disabled={pending.length === 0}
                style={{
                  flex: 1, height: 52, background: '#0a0a0a', border: '1px solid #2a3444',
                  borderRadius: 10, color: '#fff', fontSize: 26, fontWeight: 700,
                  textAlign: 'center', fontFamily: F, outline: 'none',
                  MozAppearance: 'textfield', opacity: pending.length === 0 ? 0.4 : 1,
                }}
                autoFocus
              />
              <button
                onClick={assignBib}
                disabled={!bibInput.trim() || saving || pending.length === 0}
                style={{
                  width: 80, height: 52, background: '#16a34a', border: 'none',
                  borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 800,
                  cursor: 'pointer', fontFamily: F, letterSpacing: 1,
                  opacity: !bibInput.trim() || saving || pending.length === 0 ? 0.35 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {saving ? '…' : 'Assign'}
              </button>
            </div>

            {lastSaved && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#22c55e', letterSpacing: 0.3 }}>
                ✓ #{lastSaved.place} → Bib {lastSaved.bib}{lastSaved.name ? ` (${lastSaved.name})` : ''} · {lastSaved.time}
              </div>
            )}
          </div>

          {/* Pending queue */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ padding: '8px 14px 4px', fontSize: 9, color: '#374151', textTransform: 'uppercase', letterSpacing: 2, fontFamily: F, fontWeight: 700 }}>
              Unassigned ({pending.length})
            </div>
            {pending.length === 0 ? (
              <div style={{ padding: '20px 14px', color: '#1f2937', fontSize: 12, textAlign: 'center' }}>
                {finishes.length > 0 ? 'All bibs assigned' : 'Waiting for first finisher…'}
              </div>
            ) : (
              pending.map((f, i) => (
                <div key={f.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
                  borderBottom: '1px solid #0d1117',
                  background: i === 0 ? '#0f1a0f' : 'transparent',
                }}>
                  <span style={{ color: '#374151', width: 28, fontSize: 12, fontFamily: F }}># {f.place}</span>
                  <span style={{ color: '#e2e8f0', fontWeight: 700, flex: 1, fontSize: 15, fontVariantNumeric: 'tabular-nums', fontFamily: F }}>{fmt(f.time_ms, true)}</span>
                  <span style={{ fontSize: 10, background: i === 0 ? '#052e16' : '#111', color: i === 0 ? '#22c55e' : '#374151', padding: '2px 7px', borderRadius: 4, letterSpacing: 1, fontFamily: F, fontWeight: 700 }}>
                    {i === 0 ? 'NEXT' : 'queue'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT: Full results ────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '36px 52px 88px 1fr 90px 28px', gap: 0, padding: '8px 14px', borderBottom: '1px solid #1a2030', fontSize: 9, color: '#374151', textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: F, fontWeight: 700, flexShrink: 0, background: '#0c1018' }}>
            <span>Pl</span><span>Bib</span><span>Time</span><span>Name</span><span>Team</span><span>M/F</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {finishes.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#1f2937', padding: '48px 0', fontSize: 13 }}>
                Waiting for first finisher…
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
                    display: 'grid', gridTemplateColumns: '36px 52px 88px 1fr 90px 28px',
                    gap: 0, padding: '7px 14px', borderBottom: '1px solid #0d1117',
                    background: flashId === f.id ? '#052e16'
                      : isPending ? '#0a0800'
                      : i % 2 === 0 ? 'transparent' : '#0a0c10',
                    alignItems: 'center',
                    opacity: isPending ? 0.45 : 1,
                    transition: 'background 0.4s',
                  }}>

                    {/* Place */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: medals[f.place] ?? '#1a2030', fontSize: 11, fontWeight: 800, color: medals[f.place] ? '#000' : '#4a5568', fontFamily: F }}>
                      {f.place}
                    </div>

                    {/* Bib */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: f.bib_number ? '#f97316' : '#2d3748', fontFamily: F }}>
                      {f.bib_number ?? '—'}
                    </div>

                    {/* Time + gap */}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', fontVariantNumeric: 'tabular-nums', fontFamily: F }}>
                        {fmt(f.time_ms, true)}
                      </div>
                      {gap != null && (
                        <div style={{ fontSize: 10, color: gap === 0 ? '#22c55e' : '#374151', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtGap(gap)}
                        </div>
                      )}
                    </div>

                    {/* Name */}
                    <div style={{ minWidth: 0, paddingRight: 8 }}>
                      <div style={{ fontSize: 13, color: name ? '#e2e8f0' : '#2d3748', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name ?? (isPending ? 'awaiting bib' : 'not in roster')}
                      </div>
                    </div>

                    {/* Team */}
                    <div style={{ fontSize: 11, color: '#4a5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry?.team ?? '—'}
                    </div>

                    {/* Gender */}
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
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
      `}</style>
    </div>
  )
}
