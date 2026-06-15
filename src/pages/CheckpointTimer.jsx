import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getRaceElapsedMs } from '../lib/raceClock'

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

function getModeStorageKey(checkpointId) {
  return `checkpoint_input_mode:${checkpointId}`
}

function getRepeatGuardStorageKey(checkpointId) {
  return `checkpoint_repeat_guard:${checkpointId}`
}

const modeBtn = active => ({
  flex: 1,
  height: 38,
  borderRadius: 10,
  border: '1px solid #1e2730',
  background: active ? '#1d4ed8' : '#0e1318',
  color: active ? '#fff' : '#94a3b8',
  cursor: 'pointer',
  fontFamily: F,
  fontWeight: 800,
  fontSize: 11,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
})

const guardBtn = active => ({
  padding: '6px 10px',
  borderRadius: 999,
  border: '1px solid #1e2730',
  background: active ? '#0f766e' : 'transparent',
  color: active ? '#fff' : '#94a3b8',
  cursor: 'pointer',
  fontFamily: F,
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: 1,
  textTransform: 'uppercase',
})

const filterBtn = active => ({
  padding: '7px 10px',
  borderRadius: 999,
  border: '1px solid #1e2730',
  background: active ? '#1d4ed8' : 'transparent',
  color: active ? '#fff' : '#94a3b8',
  cursor: 'pointer',
  fontFamily: F,
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: 1.2,
  textTransform: 'uppercase',
})

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

  const [inputMode, setInputMode] = useState('capture_first')
  const [repeatGuardMs, setRepeatGuardMs] = useState(0)
  const [recentFilter, setRecentFilter] = useState('all')

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
  const lastCaptureAtRef = useRef(0)

  useEffect(() => {
    const savedMode = localStorage.getItem(getModeStorageKey(checkpointId))
    if (savedMode === 'capture_first' || savedMode === 'bib_first') {
      setInputMode(savedMode)
    }

    const savedGuard = localStorage.getItem(getRepeatGuardStorageKey(checkpointId))
    if (savedGuard != null) {
      const parsed = parseInt(savedGuard, 10)
      if ([0, 300, 500].includes(parsed)) setRepeatGuardMs(parsed)
    }
  }, [checkpointId])

  useEffect(() => {
    if (!checkpointId) return
    localStorage.setItem(getModeStorageKey(checkpointId), inputMode)
  }, [checkpointId, inputMode])

  useEffect(() => {
    if (!checkpointId) return
    localStorage.setItem(getRepeatGuardStorageKey(checkpointId), String(repeatGuardMs))
  }, [checkpointId, repeatGuardMs])

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

    if (!event?.race_started_at) {
      setElapsed(0)
      return
    }

    const updateElapsed = () => {
      setElapsed(getRaceElapsedMs(event, Date.now()) ?? 0)
    }

    updateElapsed()

    if (event?.status === 'active') {
      tickRef.current = setInterval(updateElapsed, 50)
    }

    return () => clearInterval(tickRef.current)
  }, [event?.race_started_at, event?.race_finished_at, event?.status])

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
        name: `${entry.first_name ?? ''}${entry.last_name ? ` ${entry.last_name}` : ''}`.trim() || entry.team || `Bib ${bib}`,
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
        } else if (row.type === 'status_update') {
          const { target_id, payload } = row
          const { error } = await supabase
            .from('lap_events')
            .update(payload)
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

  const voided = useMemo(
    () =>
      laps
        .filter(l => l.status === 'void')
        .sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at)),
    [laps]
  )

  const nextPending = pending[0] || null

  const duplicateBibAtCheckpoint = useMemo(() => {
    const bib = bibInput.trim()
    if (!bib) return false
    return laps.some(l => l.status !== 'void' && l.bib_number === bib)
  }, [bibInput, laps])

  const filteredRecentLaps = useMemo(() => {
    const sorted = [...laps].sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))

    if (recentFilter === 'pending') {
      return sorted.filter(l => l.status === 'pending' || (l.status !== 'void' && !l.bib_number))
    }
    if (recentFilter === 'assigned') {
      return sorted.filter(l => l.status !== 'void' && !!l.bib_number)
    }
    if (recentFilter === 'void') {
      return sorted.filter(l => l.status === 'void')
    }
    return sorted
  }, [laps, recentFilter])

  const recentCaptured = useMemo(() => {
    return [...laps]
      .filter(l => l.status !== 'void')
      .sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))
      .slice(0, 3)
  }, [laps])

  const changeMode = useCallback((nextMode) => {
    if (nextMode === inputMode) return

    if (inputMode === 'bib_first' && bibInput.trim()) {
      const ok = window.confirm('Clear the current bib and switch input modes?')
      if (!ok) return
      setBibInput('')
      setPreview(null)
    }

    setInputMode(nextMode)

    setTimeout(() => {
      if (nextMode === 'bib_first') {
        inputRef.current?.focus()
      }
    }, 0)
  }, [inputMode, bibInput])

  const captureLap = useCallback(async () => {
    if (!canCapture || savingLap || !raceStart) return

    const nowTs = Date.now()
    if (repeatGuardMs > 0 && nowTs - lastCaptureAtRef.current < repeatGuardMs) {
      setMessage('Repeat tap blocked')
      setTimeout(() => setMessage(''), 900)
      return
    }

    const activeBib = bibInput.trim()
    const isBibFirst = inputMode === 'bib_first'

    if (isBibFirst && !activeBib) {
      window.alert('Enter a bib number first.')
      inputRef.current?.focus()
      return
    }

    lastCaptureAtRef.current = nowTs
    setSavingLap(true)
    const now = new Date()
    const entry = activeBib ? entries[activeBib] : null

    const row = {
      event_id: eventId,
      checkpoint_id: checkpointId,
      elapsed_ms: now.getTime() - raceStart,
      captured_at: now.toISOString(),
      status: isBibFirst ? 'assigned' : 'pending',
      bib_number: isBibFirst ? activeBib : null,
      entry_id: isBibFirst ? (entry?.id ?? null) : null,
      assigned_at: isBibFirst ? now.toISOString() : null,
      source: 'manual',
      device_id: deviceIdRef.current,
    }

    const local_id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistic = { ...row, id: local_id }

    setLaps(prev => [...prev, optimistic].sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at)))
    setFlash(true)
    setTimeout(() => setFlash(false), 160)

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
      setMessage(isBibFirst ? 'Lap saved locally, waiting to sync' : 'Tap saved locally, waiting to sync')
      setTimeout(() => setMessage(''), 2000)
    }

    if (isBibFirst) {
      setMessage(`Recorded bib ${activeBib}`)
      setBibInput('')
      setPreview(null)
      setTimeout(() => {
        inputRef.current?.focus()
        setMessage('')
      }, 1200)
    }

    setSavingLap(false)
  }, [canCapture, savingLap, eventId, checkpointId, raceStart, inputMode, bibInput, entries, repeatGuardMs])

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

    const { error } = await supabase.from('lap_events').update(update).eq('id', target.id)

    if (error) {
      const pendingLocal = loadPendingLocal(eventId, checkpointId)
      pendingLocal.push({
        type: 'status_update',
        target_id: target.id,
        payload: update,
      })
      savePendingLocal(eventId, checkpointId, pendingLocal)
      setMessage('Void saved locally, waiting to sync')
      setTimeout(() => setMessage(''), 1500)
    }
  }, [pending, eventId, checkpointId])

  const voidLap = useCallback(async (lap) => {
    const update = {
      status: 'void',
      is_corrected: true,
      correction_note: 'Voided from recent list',
    }

    setLaps(prev => prev.map(l => (l.id === lap.id ? { ...l, ...update } : l)))

    const { error } = await supabase.from('lap_events').update(update).eq('id', lap.id)

    if (error) {
      const pendingLocal = loadPendingLocal(eventId, checkpointId)
      pendingLocal.push({
        type: 'status_update',
        target_id: lap.id,
        payload: update,
      })
      savePendingLocal(eventId, checkpointId, pendingLocal)
      setMessage('Void saved locally, waiting to sync')
    } else {
      setMessage('Lap voided')
    }

    setTimeout(() => setMessage(''), 1500)
  }, [eventId, checkpointId])

  const restoreLap = useCallback(async (lap) => {
    const update = {
      status: 'pending',
      bib_number: null,
      entry_id: null,
      assigned_at: null,
      is_corrected: true,
      correction_note: 'Restored from void to pending',
    }

    setLaps(prev => prev.map(l => (l.id === lap.id ? { ...l, ...update } : l)))

    const { error } = await supabase.from('lap_events').update(update).eq('id', lap.id)

    if (error) {
      const pendingLocal = loadPendingLocal(eventId, checkpointId)
      pendingLocal.push({
        type: 'status_update',
        target_id: lap.id,
        payload: update,
      })
      savePendingLocal(eventId, checkpointId, pendingLocal)
      setMessage('Restore saved locally, waiting to sync')
    } else {
      setMessage('Lap restored to pending')
    }

    setTimeout(() => setMessage(''), 1500)
  }, [eventId, checkpointId])

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
        if (canCapture && inputMode === 'capture_first') captureLap()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [captureLap, canCapture, inputMode])

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

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: '#f97316', letterSpacing: 2, fontFamily: F, fontWeight: 700 }}>
            CHECKPOINT TIMER
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#f1f5f9', fontFamily: F, lineHeight: 1.05 }}>
            {checkpoint?.name || 'Checkpoint'}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
            {event?.name}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, color: event?.race_started_at ? '#fff' : '#374151', fontVariantNumeric: 'tabular-nums', fontFamily: F, lineHeight: 1 }}>
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
            {tab === 'timer'
              ? `⏱ Timer${pending.length ? ` (${pending.length})` : ''}`
              : `📋 Recent (${filteredRecentLaps.length})`}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div
          className="timer-panel"
          style={{
            width: 420,
            flexShrink: 0,
            borderRight: '1px solid #1a2030',
            display: mobileTab === 'timer' ? 'flex' : 'none',
            flexDirection: 'column',
            background: '#080b0f',
          }}
        >
          <div style={{ padding: '14px 16px 12px' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button onClick={() => changeMode('capture_first')} style={modeBtn(inputMode === 'capture_first')}>
                Capture First
              </button>
              <button onClick={() => changeMode('bib_first')} style={modeBtn(inputMode === 'bib_first')}>
                Bib First
              </button>
            </div>

            <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', minHeight: 18, marginBottom: 10 }}>
              {inputMode === 'capture_first'
                ? 'Tap racers as they pass. Assign bibs afterward.'
                : 'Enter bib, then tap to record immediately.'}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[0, 300, 500].map(ms => (
                <button
                  key={ms}
                  onClick={() => setRepeatGuardMs(ms)}
                  style={guardBtn(repeatGuardMs === ms)}
                  title="Optional protection against accidental repeat taps"
                >
                  {ms === 0 ? 'Guard Off' : `${(ms / 1000).toFixed(1)}s Guard`}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: '0 16px 16px' }}>
            {pending.length > 0 && (
              <div
                style={{
                  marginBottom: 12,
                  borderRadius: 12,
                  border: '1px solid rgba(234,179,8,0.28)',
                  background: 'rgba(234,179,8,0.10)',
                  padding: '12px 14px',
                }}
              >
                <div style={{ fontSize: 11, color: '#f59e0b', fontFamily: F, fontWeight: 900, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                  {pending.length} Unassigned {pending.length === 1 ? 'Tap' : 'Taps'}
                </div>
                <div style={{ marginTop: 4, fontSize: 18, color: '#fff', fontFamily: F, fontWeight: 900 }}>
                  Awaiting Bib: {nextPending ? fmt(nextPending.elapsed_ms, true) : '—'}
                </div>
                <div style={{ marginTop: 3, fontSize: 11, color: '#cbd5e1' }}>
                  Assign bibs before more taps are missed.
                </div>
              </div>
            )}

            {inputMode === 'bib_first' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ minHeight: 18, margin: '0 0 8px', fontSize: 12 }}>
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

                <input
                  ref={inputRef}
                  type="number"
                  inputMode="numeric"
                  value={bibInput}
                  onChange={e => setBibInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && bibInput.trim()) captureLap()
                  }}
                  placeholder="Enter bib"
                  disabled={!canCapture}
                  style={{
                    width: '100%',
                    height: 58,
                    background: '#0a0a0a',
                    border: '1px solid #2a3444',
                    borderRadius: 12,
                    color: '#fff',
                    fontSize: 28,
                    fontWeight: 700,
                    textAlign: 'center',
                    fontFamily: F,
                    outline: 'none',
                    MozAppearance: 'textfield',
                    opacity: canCapture ? 1 : 0.4,
                    marginBottom: 10,
                  }}
                />
              </div>
            )}

            <div className="capture-row" style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 12, alignItems: 'stretch' }}>
              <button
                onPointerDown={canCapture ? captureLap : undefined}
                disabled={!canCapture || (inputMode === 'bib_first' && !bibInput.trim())}
                style={{
                  width: '100%',
                  minHeight: 180,
                  borderRadius: 20,
                  border: 'none',
                  background: !canCapture
                    ? '#374151'
                    : flash
                      ? '#22c55e'
                      : inputMode === 'bib_first'
                        ? '#0f766e'
                        : '#1d4ed8',
                  color: '#fff',
                  fontSize: 34,
                  fontWeight: 900,
                  letterSpacing: 3,
                  cursor: canCapture && !(inputMode === 'bib_first' && !bibInput.trim()) ? 'pointer' : 'not-allowed',
                  fontFamily: F,
                  textTransform: 'uppercase',
                  transform: flash ? 'scale(0.97)' : 'scale(1)',
                  transition: 'background 0.08s, transform 0.08s',
                  touchAction: 'manipulation',
                  opacity: canCapture && !(inputMode === 'bib_first' && !bibInput.trim()) ? 1 : 0.6,
                }}
              >
                {event?.status === 'finished'
                  ? 'Race Ended'
                  : !canCapture
                    ? 'Waiting'
                    : inputMode === 'bib_first'
                      ? (bibInput.trim() ? `Bib ${bibInput.trim()}` : 'Enter Bib')
                      : 'Lap'}
              </button>

              <div
                style={{
                  borderRadius: 16,
                  border: '1px solid #1e2730',
                  background: '#0b1016',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 180,
                }}
              >
                <div style={{ fontSize: 10, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 2, fontFamily: F, fontWeight: 700 }}>
                  Last Captures
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {recentCaptured.length === 0 ? (
                    <div style={{ color: '#374151', fontSize: 14, textAlign: 'center', paddingTop: 20 }}>
                      No taps yet
                    </div>
                  ) : (
                    recentCaptured.map((l, idx) => (
                      <div key={l.id} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 10, color: idx === 0 ? '#22c55e' : '#64748b', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: F, fontWeight: 800 }}>
                          {idx === 0 ? 'Last' : idx === 1 ? 'Prev' : 'Earlier'}
                        </span>
                        <span
                          style={{
                            fontSize: idx === 0 ? 28 : 22,
                            color: '#ffffff',
                            fontWeight: 900,
                            fontFamily: F,
                            lineHeight: 1,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {fmt(l.elapsed_ms, true)}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ textAlign: 'center', fontSize: 11, color: '#64748b', marginTop: 10 }}>
                  {event?.status === 'finished'
                    ? 'Race ended'
                    : !canCapture
                      ? 'Waiting for official race start'
                      : inputMode === 'bib_first'
                        ? `Checkpoint ${checkpoint?.checkpoint_order ?? ''} · Enter bib then tap`
                        : `Checkpoint ${checkpoint?.checkpoint_order ?? ''} · Tap or spacebar`}
                </div>
              </div>
            </div>

            {message && (
              <div style={{ marginTop: 10, textAlign: 'center', fontSize: 11, color: '#f59e0b' }}>
                {message}
              </div>
            )}
          </div>

          {inputMode === 'capture_first' && (
            <>
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

                <div style={{ fontSize: 18, color: nextPending ? '#ffffff' : '#64748b', marginBottom: 8, fontFamily: F, fontWeight: 900 }}>
                  {nextPending ? `Awaiting Bib · ${fmt(nextPending.elapsed_ms, true)}` : 'No pending laps'}
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
                      height: 58,
                      background: '#0a0a0a',
                      border: '1px solid #2a3444',
                      borderRadius: 12,
                      color: '#fff',
                      fontSize: 28,
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
                      width: 100,
                      height: 58,
                      background: '#16a34a',
                      border: 'none',
                      borderRadius: 12,
                      color: '#fff',
                      fontSize: 15,
                      fontWeight: 900,
                      cursor: 'pointer',
                      fontFamily: F,
                      letterSpacing: 1.2,
                      opacity: !bibInput.trim() || !nextPending || savingAssign ? 0.35 : 1,
                      textTransform: 'uppercase',
                    }}
                  >
                    {savingAssign ? '…' : 'Assign'}
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #0d1117' }}>
                <div
                  style={{
                    padding: '8px 14px 2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      color: '#374151',
                      textTransform: 'uppercase',
                      letterSpacing: 2,
                      fontFamily: F,
                      fontWeight: 700,
                    }}
                  >
                    Pending ({pending.length})
                  </div>

                  <button
                    onClick={voidLastPending}
                    disabled={pending.length === 0}
                    style={{
                      height: 26,
                      padding: '0 10px',
                      borderRadius: 999,
                      border: '1px solid #4b1f1f',
                      background: 'transparent',
                      color: pending.length ? '#f87171' : '#4b5563',
                      fontFamily: F,
                      fontWeight: 700,
                      fontSize: 10,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      cursor: pending.length ? 'pointer' : 'default',
                      flexShrink: 0,
                    }}
                    title="Void the most recent unassigned tap"
                  >
                    Void Last Tap
                  </button>
                </div>

                <div
                  style={{
                    padding: '0 14px 6px',
                    fontSize: 10,
                    color: '#4a5568',
                    lineHeight: 1.3,
                  }}
                >
                  Voided taps can be restored from the Recent tab.
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
                        padding: '10px 14px',
                        borderBottom: '1px solid #0d1117',
                        background: i === 0 ? '#0f1a0f' : 'transparent',
                      }}
                    >
                      <span style={{ color: '#374151', width: 40, fontSize: 11, fontFamily: F }}>
                        {i === 0 ? 'NEXT' : `${i + 1}`}
                      </span>
                      <span style={{ color: '#ffffff', fontWeight: 900, flex: 1, fontSize: 20, fontVariantNumeric: 'tabular-nums', fontFamily: F }}>
                        {fmt(l.elapsed_ms, true)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {inputMode === 'bib_first' && (
            <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #0d1117' }}>
              <div style={{ padding: '14px', color: '#94a3b8', fontSize: 12, lineHeight: 1.5 }}>
                Bib First mode records laps immediately with the entered bib.
                <br />
                Use the Recent tab to correct bibs, void mistakes, or restore voided rows.
              </div>
            </div>
          )}
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
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #1a2030', background: '#0c1018' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={filterBtn(recentFilter === 'all')} onClick={() => setRecentFilter('all')}>
                All ({laps.length})
              </button>
              <button style={filterBtn(recentFilter === 'pending')} onClick={() => setRecentFilter('pending')}>
                Pending ({pending.length})
              </button>
              <button style={filterBtn(recentFilter === 'assigned')} onClick={() => setRecentFilter('assigned')}>
                Assigned ({assigned.length})
              </button>
              <button style={filterBtn(recentFilter === 'void')} onClick={() => setRecentFilter('void')}>
                Voided ({voided.length})
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 70px 1fr 90px 96px',
              padding: '8px 14px',
              borderBottom: '1px solid #1a2030',
              fontSize: 9,
              color: '#374151',
              textTransform: 'uppercase',
              letterSpacing: 1.5,
              fontFamily: F,
              fontWeight: 700,
              flexShrink: 0,
              background: '#0c1018',
            }}
          >
            <span>Time</span>
            <span>Bib</span>
            <span>Name</span>
            <span>Status</span>
            <span>Action</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredRecentLaps.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#1f2937', padding: '48px 0', fontSize: 13 }}>
                No laps in this filter
              </div>
            ) : (
              filteredRecentLaps.map((l, i) => {
                const entry = l.bib_number ? entries[l.bib_number] : null
                const name = entry
                  ? (`${entry.first_name ?? ''}${entry.last_name ? ` ${entry.last_name}` : ''}`.trim() || entry.team || null)
                  : null
                const isPending = !l.bib_number && l.status !== 'void'

                return (
                  <div
                    key={l.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '90px 70px 1fr 90px 96px',
                      padding: '8px 14px',
                      borderBottom: '1px solid #0d1117',
                      background: l.status === 'void' ? '#1a0f0f' : isPending ? '#0a0800' : i % 2 === 0 ? 'transparent' : '#0a0c10',
                      opacity: l.status === 'void' ? 0.6 : isPending ? 0.75 : 1,
                      alignItems: 'center',
                      gap: 8,
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

                    <div>
                      {l.status === 'void' ? (
                        <button
                          onClick={() => restoreLap(l)}
                          style={{
                            minWidth: 78,
                            height: 30,
                            borderRadius: 8,
                            border: '1px solid #1f5130',
                            background: 'transparent',
                            color: '#22c55e',
                            fontFamily: F,
                            fontWeight: 700,
                            fontSize: 11,
                            letterSpacing: 1,
                            cursor: 'pointer',
                          }}
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          onClick={() => voidLap(l)}
                          style={{
                            minWidth: 78,
                            height: 30,
                            borderRadius: 8,
                            border: '1px solid #4b1f1f',
                            background: 'transparent',
                            color: '#f87171',
                            fontFamily: F,
                            fontWeight: 700,
                            fontSize: 11,
                            letterSpacing: 1,
                            cursor: 'pointer',
                          }}
                        >
                          Void
                        </button>
                      )}
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
        @media (min-width: 768px) {
          .timer-panel { display: flex !important; }
          .recent-panel { display: flex !important; }
        }
        @media (max-width: 900px) {
          .capture-row {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}