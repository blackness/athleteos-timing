import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const F = "'Barlow Condensed', sans-serif"
const FB = "'Barlow', sans-serif"

function fmt(ms, short = false) {
  if (ms == null) return short ? '--:--' : '--:--:--'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const cs = Math.floor((ms % 1000) / 10)
  if (short || h === 0) return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function getDeviceId() {
  const key = 'checkpoint_timer_device_id'
  let v = localStorage.getItem(key)
  if (!v) {
    v = `dev-${crypto.randomUUID()}`
    localStorage.setItem(key, v)
  }
  return v
}

function getPendingLocalKey(eventId, checkpointId) {
  return `lap_unsynced:${eventId}:${checkpointId}`
}

function loadPendingLocal(eventId, checkpointId) {
  try {
    return JSON.parse(localStorage.getItem(getPendingLocalKey(eventId, checkpointId)) || '[]')
  } catch {
    return []
  }
}

function savePendingLocal(eventId, checkpointId, rows) {
  localStorage.setItem(getPendingLocalKey(eventId, checkpointId), JSON.stringify(rows))
}

export default function CheckpointTimer() {
  const { id: eventId, checkpointId } = useParams()
  const navigate = useNavigate()

  const [event, setEvent] = useState(null)
  const [checkpoint, setCheckpoint] = useState(null)
  const [entries, setEntries] = useState({})
  const [laps, setLaps] = useState([])
  const [raceStart, setRaceStart] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  const [bibInput, setBibInput] = useState('')
  const [preview, setPreview] = useState(null)

  const [savingLap, setSavingLap] = useState(false)
  const [savingAssign, setSavingAssign] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [flash, setFlash] = useState(false)
  const [message, setMessage] = useState('')
  const [mobileTab, setMobileTab] = useState('timer')

  const [editingLapId, setEditingLapId] = useState(null)
  const [editingBib, setEditingBib] = useState('')

  const tickRef = useRef(null)
  const retryRef = useRef(null)
  const inputRef = useRef(null)
  const deviceIdRef = useRef(null)

  useEffect(() => {
    if (!eventId || !checkpointId) return
    deviceIdRef.current = getDeviceId()

    async function load() {
      const [
        { data: eventData },
        { data: checkpointData },
        { data: entryData },
        { data: lapData },
      ] = await Promise.all([
        supabase.from('race_events').select('*').eq('id', eventId).single(),
        supabase.from('race_checkpoints').select('*').eq('id', checkpointId).single(),
        supabase.from('event_entries').select('*').eq('event_id', eventId),
        supabase
          .from('lap_events')
          .select('*')
          .eq('event_id', eventId)
          .eq('checkpoint_id', checkpointId)
          .order('captured_at', { ascending: true }),
      ])

      setEvent(eventData || null)
      setCheckpoint(checkpointData || null)

      if (eventData?.race_started_at) {
        setRaceStart(new Date(eventData.race_started_at).getTime())
      }

      const map = {}
      ;(entryData || []).forEach(e => { map[e.bib_number] = e })
      setEntries(map)
      setLaps(lapData || [])
    }

    load()

    const ch = supabase
      .channel(`checkpoint:${eventId}:${checkpointId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'race_events', filter: `id=eq.${eventId}` },
        payload => {
          setEvent(payload.new)
          if (payload.new?.race_started_at) {
            setRaceStart(new Date(payload.new.race_started_at).getTime())
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lap_events', filter: `event_id=eq.${eventId}` },
        payload => {
          const row = payload.new
          if (row.checkpoint_id !== checkpointId) return

          setLaps(prev => {
            if (prev.find(x => x.id === row.id)) return prev
            return [...prev, row].sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at))
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lap_events', filter: `event_id=eq.${eventId}` },
        payload => {
          const row = payload.new
          if (row.checkpoint_id !== checkpointId) return

          setLaps(prev => {
            const exists = prev.find(x => x.id === row.id)
            const next = exists
              ? prev.map(x => (x.id === row.id ? row : x))
              : [...prev, row]

            return next.sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at))
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
      clearInterval(tickRef.current)
      clearInterval(retryRef.current)
    }
  }, [eventId, checkpointId])

  useEffect(() => {
    clearInterval(tickRef.current)
    if (!raceStart) return

    tickRef.current = setInterval(() => {
      setElapsed(Date.now() - raceStart)
    }, 50)

    return () => clearInterval(tickRef.current)
  }, [raceStart])

  useEffect(() => {
    const bib = bibInput.trim()
    if (!bib) {
      setPreview(null)
      return
    }
    const entry = entries[bib]
    if (entry) {
      setPreview({
        found: true,
        name: `${entry.first_name}${entry.last_name ? ` ${entry.last_name}` : ''}`,
        team: entry.team || '',
      })
    } else {
      setPreview({ found: false })
    }
  }, [bibInput, entries])

  useEffect(() => {
    if (!eventId || !checkpointId) return

    async function retryUnsynced() {
      const pendingLocal = loadPendingLocal(eventId, checkpointId)
      if (!pendingLocal.length) return

      setSyncing(true)
      const remaining = []

      for (const row of pendingLocal) {
        if (row.type === 'insert') {
          const { local_id, type, ...dbRow } = row
          const { data, error } = await supabase.from('lap_events').insert(dbRow).select().single()
          if (!error && data) {
            setLaps(prev => {
              const withoutLocal = prev.filter(x => x.id !== local_id)
              if (withoutLocal.find(x => x.id === data.id)) return withoutLocal
              return [...withoutLocal, data].sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at))
            })
          } else {
            remaining.push(row)
          }
        } else if (row.type === 'assign') {
          const { target_id, bib_number, entry_id } = row
          const { error } = await supabase
            .from('lap_events')
            .update({
              bib_number,
              entry_id,
              assigned_at: new Date().toISOString(),
              status: 'assigned',
              is_corrected: true,
            })
            .eq('id', target_id)

          if (error) remaining.push(row)
        } else {
          remaining.push(row)
        }
      }

      savePendingLocal(eventId, checkpointId, remaining)
      setSyncing(false)
    }

    retryUnsynced()
    retryRef.current = setInterval(retryUnsynced, 5000)

    return () => clearInterval(retryRef.current)
  }, [eventId, checkpointId])

  const canCapture = event?.status === 'active' && !!raceStart

  const pending = useMemo(
    () =>
      laps
        .filter(l => (l.status === 'pending' || (l.status !== 'void' && !l.bib_number)))
        .sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at)),
    [laps]
  )

  const assigned = useMemo(
    () =>
      laps
        .filter(l => l.status !== 'void' && !!l.bib_number)
        .sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at)),
    [laps]
  )

  const nextPending = pending[0] || null

  const duplicateBibAtCheckpoint = useMemo(() => {
    const bib = bibInput.trim()
    if (!bib) return false
    return laps.some(l => l.status !== 'void' && l.bib_number === bib)
  }, [bibInput, laps])

  const captureLap = useCallback(async () => {
    if (!canCapture || savingLap) return

    setSavingLap(true)
    const now = new Date()

    const row = {
      event_id: eventId,
      checkpoint_id: checkpointId,
      elapsed_ms: now.getTime() - raceStart,
      captured_at: now.toISOString(),
      status: 'pending',
      bib_number: null,
      entry_id: null,
      source: 'manual',
      device_id: deviceIdRef.current,
    }

    const local_id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistic = { ...row, id: local_id }

    setLaps(prev => [...prev, optimistic].sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at)))
    setFlash(true)
    setTimeout(() => setFlash(false), 120)

    const { data, error } = await supabase.from('lap_events').insert(row).select().single()

    if (!error && data) {
      setLaps(prev =>
        prev
          .filter(x => x.id !== local_id)
          .concat(data)
          .sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at))
      )
    } else {
      const pendingLocal = loadPendingLocal(eventId, checkpointId)
      pendingLocal.push({ type: 'insert', local_id, ...row })
      savePendingLocal(eventId, checkpointId, pendingLocal)
      setMessage('Tap saved locally, waiting to sync')
      setTimeout(() => setMessage(''), 2000)
    }

    setSavingLap(false)
  }, [canCapture, savingLap, eventId, checkpointId, raceStart])

  const assignBib = useCallback(async () => {
    const bib = bibInput.trim()
    if (!bib || !nextPending || savingAssign) return

    setSavingAssign(true)
    const entry = entries[bib]

    const update = {
      bib_number: bib,
      entry_id: entry?.id ?? null,
      assigned_at: new Date().toISOString(),
      status: 'assigned',
    }

    setLaps(prev => prev.map(l => (l.id === nextPending.id ? { ...l, ...update } : l)))

    const { error } = await supabase.from('lap_events').update(update).eq('id', nextPending.id)

    if (error) {
      const pendingLocal = loadPendingLocal(eventId, checkpointId)
      pendingLocal.push({
        type: 'assign',
        target_id: nextPending.id,
        bib_number: bib,
        entry_id: entry?.id ?? null,
      })
      savePendingLocal(eventId, checkpointId, pendingLocal)
      setMessage('Assignment saved locally, waiting to sync')
    } else {
      setMessage(`Assigned bib ${bib}`)
    }

    setBibInput('')
    setPreview(null)
    setSavingAssign(false)
    inputRef.current?.focus()
    setTimeout(() => setMessage(''), 1500)
  }, [bibInput, nextPending, savingAssign, entries, eventId, checkpointId])

  const voidLastPending = useCallback(async () => {
    const target = [...pending].reverse()[0]
    if (!target) return

    const update = {
      status: 'void',
      is_corrected: true,
      correction_note: 'Voided from checkpoint timer',
    }

    setLaps(prev => prev.map(l => (l.id === target.id ? { ...l, ...update } : l)))
    await supabase.from('lap_events').update(update).eq('id', target.id)
  }, [pending])

  const saveEditedBib = useCallback(async (lap) => {
    const bib = editingBib.trim()

    const duplicate = laps.some(
      x => x.id !== lap.id && x.status !== 'void' && x.bib_number === bib
    )

    if (duplicate && bib) {
      const ok = window.confirm(`Bib ${bib} already exists at this checkpoint. Save anyway?`)
      if (!ok) return
    }

    const entry = bib ? entries[bib] : null
    const update = {
      bib_number: bib || null,
      entry_id: entry?.id ?? null,
      assigned_at: bib ? new Date().toISOString() : null,
      status: bib ? 'assigned' : 'pending',
      is_corrected: true,
    }

    setLaps(prev => prev.map(l => (l.id === lap.id ? { ...l, ...update } : l)))
    await supabase.from('lap_events').update(update).eq('id', lap.id)

    setEditingLapId(null)
    setEditingBib('')
  }, [editingBib, entries, laps])

  useEffect(() => {
    const h = e => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
        e.preventDefault()
        if (canCapture) captureLap()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [captureLap, canCapture])

  return (
    <div style={{ minHeight: '100dvh', background: '#080b0f', color: '#e2e8f0', fontFamily: FB, display: 'flex', flexDirection: 'column' }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />

      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #1a2030', background: '#0c1018', gap: 12 }}>
        <button
          onClick={() => navigate(`/race/${eventId}/checkpoints`)}
          style={{ background: 'none', border: '1px solid #1e2730', color: '#4a5568', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 11, fontFamily: F, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}
        >
          ← Checkpoints
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: '#f97316', letterSpacing: 2, fontFamily: F, fontWeight: 700 }}>
            CHECKPOINT TIMER
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', fontFamily: F }}>
            {event?.name} {checkpoint ? `· ${checkpoint.name}` : ''}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, color: raceStart ? '#fff' : '#374151', fontVariantNumeric: 'tabular-nums', fontFamily: F, lineHeight: 1 }}>
            {fmt(elapsed)}
          </div>
          <div style={{ fontSize: 9, color: syncing ? '#f59e0b' : '#374151', letterSpacing: 1, textTransform: 'uppercase' }}>
            {syncing ? 'Syncing…' : event?.status === 'finished' ? 'Race finished' : canCapture ? 'Race active' : 'Waiting for start'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #1a2030', background: '#0c1018' }}>
        {['timer', 'recent'].map(tab => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            style={{
              flex: 1,
              padding: '10px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontFamily: F,
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: mobileTab === tab ? '#f97316' : '#374151',
              borderBottom: mobileTab === tab ? '2px solid #f97316' : '2px solid transparent',
            }}
          >
            {tab === 'timer' ? `⏱ Timer${pending.length ? ` (${pending.length})` : ''}` : `📋 Recent (${assigned.length})`}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div
          className="timer-panel"
          style={{
            width: 340,
            flexShrink: 0,
            borderRight: '1px solid #1a2030',
            display: mobileTab === 'timer' ? 'flex' : 'none',
            flexDirection: 'column',
            background: '#080b0f',
          }}
        >
          <div style={{ padding: '20px 20px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: -3, color: raceStart ? '#fff' : '#374151', fontVariantNumeric: 'tabular-nums', fontFamily: F, lineHeight: 1 }}>
              {fmt(elapsed)}
            </div>
            <div style={{ fontSize: 11, color: '#374151', marginTop: 4 }}>
              {canCapture
                ? `${laps.filter(l => l.status !== 'void').length} recorded · ${pending.length} awaiting bib`
                : event?.status === 'finished'
                  ? 'Race complete'
                  : 'Waiting for official race start'}
            </div>
          </div>

          <div style={{ padding: '0 16px 16px' }}>
            <button
              onPointerDown={canCapture ? captureLap : undefined}
              disabled={!canCapture}
              style={{
                width: '100%',
                height: 160,
                borderRadius: 20,
                border: 'none',
                background: !canCapture ? '#374151' : flash ? '#22c55e' : '#1d4ed8',
                color: '#fff',
                fontSize: 32,
                fontWeight: 900,
                letterSpacing: 4,
                cursor: canCapture ? 'pointer' : 'not-allowed',
                fontFamily: F,
                textTransform: 'uppercase',
                transform: flash ? 'scale(0.97)' : 'scale(1)',
                transition: 'background 0.06s, transform 0.06s',
                touchAction: 'manipulation',
                opacity: canCapture ? 1 : 0.6,
              }}
            >
              {event?.status === 'finished' ? 'RACE ENDED' : canCapture ? 'LAP' : 'WAITING'}
            </button>

            <div style={{ textAlign: 'center', fontSize: 11, color: '#374151', marginTop: 8 }}>
              {event?.status === 'finished'
                ? 'Race ended'
                : canCapture
                  ? `Checkpoint ${checkpoint?.checkpoint_order ?? ''} · Tap or spacebar`
                  : 'Waiting for official race start'}
            </div>

            {message && (
              <div style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: '#f59e0b' }}>
                {message}
              </div>
            )}
          </div>

          <div style={{ padding: '0 16px 16px', borderTop: '1px solid #0d1117' }}>
            <div style={{ paddingTop: 12, fontSize: 9, color: '#374151', textTransform: 'uppercase', letterSpacing: 2, fontFamily: F, fontWeight: 700 }}>
              Assign next bib
            </div>

            <div style={{ minHeight: 18, margin: '8px 0', fontSize: 12 }}>
              {preview?.found && (
                <span style={{ color: '#22c55e' }}>
                  ✓ {preview.name}{preview.team ? ` · ${preview.team}` : ''}
                </span>
              )}
              {preview && !preview.found && (
                <span style={{ color: '#f59e0b' }}>⚠ Not in roster</span>
              )}
              {duplicateBibAtCheckpoint && (
                <span style={{ color: '#ef4444', marginLeft: 8 }}>⚠ Bib already recorded at this checkpoint</span>
              )}
            </div>

            <div style={{ fontSize: 12, color: nextPending ? '#e2e8f0' : '#374151', marginBottom: 8 }}>
              {nextPending ? `Next: ${fmt(nextPending.elapsed_ms, true)}` : 'No pending laps'}
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
                disabled={!nextPending}
                style={{
                  flex: 1,
                  height: 52,
                  background: '#0a0a0a',
                  border: '1px solid #2a3444',
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: 26,
                  fontWeight: 700,
                  textAlign: 'center',
                  fontFamily: F,
                  outline: 'none',
                  MozAppearance: 'textfield',
                  opacity: !nextPending ? 0.4 : 1,
                }}
              />
              <button
                onClick={assignBib}
                disabled={!bibInput.trim() || !nextPending || savingAssign}
                style={{
                  width: 80,
                  height: 52,
                  background: '#16a34a',
                  border: 'none',
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: F,
                  letterSpacing: 1,
                  opacity: !bibInput.trim() || !nextPending || savingAssign ? 0.35 : 1,
                }}
              >
                {savingAssign ? '…' : 'Assign'}
              </button>
            </div>

            <button
              onClick={voidLastPending}
              disabled={pending.length === 0}
              style={{
                marginTop: 8,
                width: '100%',
                height: 38,
                borderRadius: 10,
                border: '1px solid #3f1d1d',
                background: 'transparent',
                color: pending.length ? '#f87171' : '#4b5563',
                fontFamily: F,
                fontWeight: 700,
                letterSpacing: 1,
                cursor: pending.length ? 'pointer' : 'default',
              }}
            >
              Void last pending tap
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #0d1117' }}>
            <div style={{ padding: '8px 14px 4px', fontSize: 9, color: '#374151', textTransform: 'uppercase', letterSpacing: 2, fontFamily: F, fontWeight: 700 }}>
              Pending ({pending.length})
            </div>

            {pending.length === 0 ? (
              <div style={{ padding: '20px 14px', color: '#1f2937', fontSize: 12, textAlign: 'center' }}>
                No pending laps
              </div>
            ) : (
              pending.map((l, i) => (
                <div
                  key={l.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 14px',
                    borderBottom: '1px solid #0d1117',
                    background: i === 0 ? '#0f1a0f' : 'transparent',
                  }}
                >
                  <span style={{ color: '#374151', width: 34, fontSize: 11, fontFamily: F }}>
                    {i === 0 ? 'NEXT' : `${i + 1}`}
                  </span>
                  <span style={{ color: '#e2e8f0', fontWeight: 700, flex: 1, fontSize: 15, fontVariantNumeric: 'tabular-nums', fontFamily: F }}>
                    {fmt(l.elapsed_ms, true)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div
          className="recent-panel"
          style={{
            flex: 1,
            display: mobileTab === 'recent' ? 'flex' : 'none',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '90px 70px 1fr 90px', padding: '8px 14px', borderBottom: '1px solid #1a2030', fontSize: 9, color: '#374151', textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: F, fontWeight: 700, flexShrink: 0, background: '#0c1018' }}>
            <span>Time</span>
            <span>Bib</span>
            <span>Name</span>
            <span>Status</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {laps.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#1f2937', padding: '48px 0', fontSize: 13 }}>
                No laps recorded yet
              </div>
            ) : (
              [...laps]
                .sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))
                .map((l, i) => {
                  const entry = l.bib_number ? entries[l.bib_number] : null
                  const name = entry ? `${entry.first_name}${entry.last_name ? ` ${entry.last_name}` : ''}` : null
                  const isPending = !l.bib_number && l.status !== 'void'

                  return (
                    <div
                      key={l.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '90px 70px 1fr 90px',
                        padding: '8px 14px',
                        borderBottom: '1px solid #0d1117',
                        background: l.status === 'void' ? '#1a0f0f' : isPending ? '#0a0800' : i % 2 === 0 ? 'transparent' : '#0a0c10',
                        opacity: l.status === 'void' ? 0.5 : isPending ? 0.65 : 1,
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', fontVariantNumeric: 'tabular-nums', fontFamily: F }}>
                        {fmt(l.elapsed_ms, true)}
                      </span>

                      {editingLapId === l.id ? (
                        <input
                          value={editingBib}
                          onChange={e => setEditingBib(e.target.value)}
                          onBlur={() => saveEditedBib(l)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEditedBib(l)
                            if (e.key === 'Escape') {
                              setEditingLapId(null)
                              setEditingBib('')
                            }
                          }}
                          autoFocus
                          style={{
                            width: 56,
                            height: 28,
                            background: '#0a0a0a',
                            border: '1px solid #f97316',
                            borderRadius: 6,
                            color: '#fff',
                            fontSize: 13,
                            fontWeight: 700,
                            textAlign: 'center',
                            fontFamily: F,
                            outline: 'none',
                          }}
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingLapId(l.id)
                            setEditingBib(l.bib_number ?? '')
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: l.bib_number ? '#f97316' : '#2d3748',
                            fontSize: 13,
                            fontWeight: 700,
                            fontFamily: F,
                            cursor: 'pointer',
                            padding: 0,
                            textAlign: 'left',
                          }}
                          title="Click to edit bib"
                        >
                          {l.bib_number ?? '—'}
                        </button>
                      )}

                      <span style={{ fontSize: 13, color: name ? '#e2e8f0' : '#2d3748', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name ?? (l.status === 'void' ? 'voided' : isPending ? 'awaiting bib' : 'not in roster')}
                      </span>

                      <span style={{ fontSize: 11, color: l.status === 'void' ? '#f87171' : isPending ? '#f59e0b' : '#22c55e', textTransform: 'uppercase', letterSpacing: 1 }}>
                        {l.status}
                      </span>
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
        @media (min-width: 768px) {
          .timer-panel { display: flex !important; }
          .recent-panel { display: flex !important; }
        }
      `}</style>
    </div>
  )
}