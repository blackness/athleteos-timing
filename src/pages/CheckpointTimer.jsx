import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getRaceElapsedMs } from '../lib/raceClock'

const F = "'Barlow Condensed', sans-serif"
const FB = "'Barlow', sans-serif"

const THEMES = {
  dark: {
    bg: '#080b0f',
    pageAlt: '#0c1018',
    panel: '#0e1318',
    panel2: '#141920',
    border: '#1a2030',
    border2: '#243040',
    faint: '#10161f',
    inputBg: '#070a0f',
    inputBorder: '#1f2937',
    text: '#cbd5e1',
    textStrong: '#f8fafc',
    muted: '#64748b',
    muted2: '#475569',
    dim: '#334155',
    accent: '#f97316',
    accentAlt: '#3b82f6',
    buttonText: '#ffffff',
    success: '#10b981',
    successBright: '#34d399',
    successBg: 'rgba(16,185,129,0.10)',
    successBorder: 'rgba(16,185,129,0.28)',
    warning: '#f59e0b',
    warningBg: 'rgba(245,158,11,0.10)',
    warningBorder: 'rgba(245,158,11,0.25)',
    danger: '#ef4444',
    dangerBg: 'rgba(239,68,68,0.08)',
    dangerBorder: 'rgba(239,68,68,0.3)',
    pendingBg: 'rgba(245,158,11,0.06)',
    pendingNext: 'rgba(245,158,11,0.10)',
    voidBg: 'rgba(239,68,68,0.08)',
    zebra: '#0b1118',
    flash: '#fb923c',
    info: '#38bdf8',
    infoBg: 'rgba(56,189,248,0.10)',
    infoBorder: 'rgba(56,189,248,0.22)',
  },
  light: {
    bg: '#f8fafc',
    pageAlt: '#ffffff',
    panel: '#ffffff',
    panel2: '#f1f5f9',
    border: '#dbe2ea',
    border2: '#cbd5e1',
    faint: '#edf2f7',
    inputBg: '#ffffff',
    inputBorder: '#cbd5e1',
    text: '#334155',
    textStrong: '#0f172a',
    muted: '#64748b',
    muted2: '#94a3b8',
    dim: '#94a3b8',
    accent: '#ea580c',
    accentAlt: '#2563eb',
    buttonText: '#ffffff',
    success: '#16a34a',
    successBright: '#16a34a',
    successBg: 'rgba(22,163,74,0.08)',
    successBorder: 'rgba(22,163,74,0.22)',
    warning: '#d97706',
    warningBg: 'rgba(217,119,6,0.08)',
    warningBorder: 'rgba(217,119,6,0.2)',
    danger: '#dc2626',
    dangerBg: 'rgba(220,38,38,0.06)',
    dangerBorder: 'rgba(220,38,38,0.25)',
    pendingBg: 'rgba(217,119,6,0.05)',
    pendingNext: 'rgba(217,119,6,0.10)',
    voidBg: 'rgba(220,38,38,0.06)',
    zebra: '#f8fafc',
    flash: '#fb923c',
    info: '#0284c7',
    infoBg: 'rgba(2,132,199,0.08)',
    infoBorder: 'rgba(2,132,199,0.20)',
  },
}

function fmt(ms, includeCenti = true) {
  if (ms == null) return '00:00'
  const total = Math.max(0, ms)
  const hours = Math.floor(total / 3600000)
  const minutes = Math.floor((total % 3600000) / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const centi = Math.floor((total % 1000) / 10)

  if (hours > 0) {
    return includeCenti
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centi).padStart(2, '0')}`
      : `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return includeCenti
    ? `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centi).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getDeviceId() {
  const key = 'checkpoint_timer_device_id'
  let existing = localStorage.getItem(key)
  if (existing) return existing
  const created = `device-${Math.random().toString(36).slice(2)}-${Date.now()}`
  localStorage.setItem(key, created)
  return created
}

function getModeStorageKey(checkpointId) {
  return `checkpoint_timer_mode:${checkpointId}`
}

function getRepeatGuardStorageKey(checkpointId) {
  return `checkpoint_timer_repeat_guard:${checkpointId}`
}

function getThemeStorageKey(checkpointId) {
  return `checkpoint_timer_theme:${checkpointId}`
}

function getPendingLocalStorageKey(eventId, checkpointId) {
  return `checkpoint_timer_pending:${eventId}:${checkpointId}`
}

function loadPendingLocal(eventId, checkpointId) {
  try {
    const raw = localStorage.getItem(getPendingLocalStorageKey(eventId, checkpointId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePendingLocal(eventId, checkpointId, rows) {
  localStorage.setItem(getPendingLocalStorageKey(eventId, checkpointId), JSON.stringify(rows))
}

export default function CheckpointTimer() {
  const { id: eventId, checkpointId } = useParams()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [event, setEvent] = useState(null)
  const [checkpoint, setCheckpoint] = useState(null)
  const [entries, setEntries] = useState({})
  const [laps, setLaps] = useState([])
  const [raceStart, setRaceStart] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  const [bibInput, setBibInput] = useState('')
  const [preview, setPreview] = useState(null)
  const [bibEntryActive, setBibEntryActive] = useState(false)

  const [inputMode, setInputMode] = useState('capture_first')
  const [repeatGuardMs, setRepeatGuardMs] = useState(0)
  const [recentFilter, setRecentFilter] = useState('all')
  const [theme, setTheme] = useState('dark')

  const [savingLap, setSavingLap] = useState(false)
  const [savingAssign, setSavingAssign] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [flash, setFlash] = useState(false)
  const [message, setMessage] = useState('')
  const [mobileTab, setMobileTab] = useState('timer')

  const [editingLapId, setEditingLapId] = useState(null)
  const [editingBib, setEditingBib] = useState('')

  const [lastAction, setLastAction] = useState(null)
  const [confirmUndoOpen, setConfirmUndoOpen] = useState(false)

  const tickRef = useRef(null)
  const retryRef = useRef(null)
  const inputRef = useRef(null)
  const deviceIdRef = useRef(null)
  const lastCaptureAtRef = useRef(0)

  const T = THEMES[theme]
  const isAdmin = !!session?.user

  const modeBtn = active => ({
    flex: 1,
    height: 40,
    borderRadius: 10,
    border: `1px solid ${T.border2}`,
    background: active ? T.accent : T.panel2,
    color: active ? T.buttonText : T.muted,
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
    border: `1px solid ${T.border2}`,
    background: active ? T.accentAlt : 'transparent',
    color: active ? T.buttonText : T.muted,
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
    border: `1px solid ${T.border2}`,
    background: active ? T.accent : 'transparent',
    color: active ? T.buttonText : T.muted,
    cursor: 'pointer',
    fontFamily: F,
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  })

  const themeBtn = active => ({
    padding: '6px 10px',
    borderRadius: 999,
    border: `1px solid ${T.border2}`,
    background: active ? T.panel2 : 'transparent',
    color: active ? T.textStrong : T.muted,
    cursor: 'pointer',
    fontFamily: F,
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  })

  const statusPill = (tone = 'default') => {
    if (tone === 'success') {
      return {
        background: T.successBg,
        border: `1px solid ${T.successBorder}`,
        color: T.successBright,
      }
    }
    if (tone === 'warning') {
      return {
        background: T.warningBg,
        border: `1px solid ${T.warningBorder}`,
        color: T.warning,
      }
    }
    if (tone === 'danger') {
      return {
        background: T.dangerBg,
        border: `1px solid ${T.dangerBorder}`,
        color: T.danger,
      }
    }
    if (tone === 'info') {
      return {
        background: T.infoBg,
        border: `1px solid ${T.infoBorder}`,
        color: T.info,
      }
    }
    return {
      background: T.panel2,
      border: `1px solid ${T.border2}`,
      color: T.muted,
    }
  }

  const setTransientMessage = useCallback((text, ms = 1500) => {
    setMessage(text)
    if (ms) {
      window.setTimeout(() => setMessage(''), ms)
    }
  }, [])

  const pushLastAction = useCallback((payload) => {
    setLastAction({
      at: Date.now(),
      ...payload,
    })
  }, [])

  const refocusBibInput = useCallback(() => {
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.select?.()
      }
    })
  }, [])

  const isPendingLap = useCallback(
    lap => lap?.status !== 'void' && !lap?.bib_number,
    []
  )

  const getEntryDisplayName = useCallback((bib) => {
    const entry = bib ? entries[bib] : null
    if (!entry) return bib ? `Bib ${bib}` : 'Pending tap'
    return `${entry.first_name ?? ''}${entry.last_name ? ` ${entry.last_name}` : ''}`.trim() || entry.team || `Bib ${bib}`
  }, [entries])

  const getEntryTeam = useCallback((bib) => {
    const entry = bib ? entries[bib] : null
    return entry?.team || ''
  }, [entries])

  const getLastActionTone = useCallback(() => {
    if (!lastAction) return null
    if (lastAction.status === 'failed') return { tone: 'danger', icon: '⚠', title: 'Action Failed' }
    if (lastAction.status === 'local') return { tone: 'warning', icon: '☁', title: 'Saved Locally' }
    if (lastAction.status === 'syncing') return { tone: 'info', icon: '↻', title: 'Saving' }
    if (lastAction.type === 'undo') return { tone: 'warning', icon: '↩', title: 'Last Undo' }
    if (lastAction.type === 'void') return { tone: 'warning', icon: '⛔', title: 'Voided' }
    if (lastAction.type === 'assign') return { tone: 'success', icon: '✓', title: 'Last Assignment' }
    return { tone: 'success', icon: '✓', title: 'Last Capture' }
  }, [lastAction])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])
  useEffect(() => {
    setConfirmUndoOpen(false)
  }, [lastAction?.lapId])
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

    const savedTheme = localStorage.getItem(getThemeStorageKey(checkpointId))
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme)
    } else {
      setTheme('light')
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
    if (!checkpointId) return
    localStorage.setItem(getThemeStorageKey(checkpointId), theme)
  }, [checkpointId, theme])

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
        name: getEntryDisplayName(bib),
        team: entry.team || '',
      })
    } else {
      setPreview({ found: false })
    }
  }, [bibInput, entries, getEntryDisplayName])

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

            pushLastAction({
              type: 'capture',
              status: 'saved',
              lapId: data.id,
              bib_number: data.bib_number || null,
              name: data.bib_number ? getEntryDisplayName(data.bib_number) : 'Pending tap',
              team: data.bib_number ? getEntryTeam(data.bib_number) : '',
              elapsed_ms: data.elapsed_ms,
              detail: 'Local save synced successfully',
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
  }, [eventId, checkpointId, getEntryDisplayName, getEntryTeam, pushLastAction])

  const canCapture = event?.status === 'active' && !!raceStart

  const pending = useMemo(
    () =>
      laps
        .filter(isPendingLap)
        .sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at)),
    [laps, isPendingLap]
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
  const undoTarget = useMemo(() => {
    if (!lastAction?.lapId) return null
    return laps.find(l => l.id === lastAction.lapId && l.status !== 'void') || null
  }, [lastAction, laps])

  const showAssignMainButton = useMemo(() => {
    return (
      inputMode === 'capture_first' &&
      !!nextPending &&
      (bibEntryActive || !!bibInput.trim())
    )
  }, [inputMode, nextPending, bibEntryActive, bibInput])

  const duplicateBibAtCheckpoint = useMemo(() => {
    const bib = bibInput.trim()
    if (!bib) return false
    return laps.some(l => l.status !== 'void' && l.bib_number === bib)
  }, [bibInput, laps])

  const filteredRecentLaps = useMemo(() => {
    const sorted = [...laps].sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))

    if (recentFilter === 'pending') return sorted.filter(isPendingLap)
    if (recentFilter === 'assigned') return sorted.filter(l => l.status !== 'void' && !!l.bib_number)
    if (recentFilter === 'void') return sorted.filter(l => l.status === 'void')
    return sorted
  }, [laps, recentFilter, isPendingLap])

  const recentCaptured = useMemo(() => {
    return [...laps]
      .filter(l => l.status !== 'void')
      .sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))
      .slice(0, 5)
  }, [laps])

  const checkpointCount = useMemo(() => {
    return laps.filter(l => l.status !== 'void').length
  }, [laps])

  const lastActiveLap = useMemo(() => {
    return [...laps]
      .filter(l => l.status !== 'void')
      .sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))[0] || null
  }, [laps])

  const currentSaveState = useMemo(() => {
    const pendingLocal = eventId && checkpointId ? loadPendingLocal(eventId, checkpointId) : []
    if (syncing) return { label: 'Syncing…', tone: 'info' }
    if (pendingLocal.length > 0) return { label: 'Saved locally', tone: 'warning' }
    if (canCapture) return { label: 'Ready', tone: 'success' }
    if (event?.status === 'finished') return { label: 'Race finished', tone: 'default' }
    return { label: 'Waiting', tone: 'default' }
  }, [eventId, checkpointId, syncing, canCapture, event?.status])

  const changeMode = useCallback((nextMode) => {
    if (nextMode === inputMode) return

    if (inputMode === 'bib_first' && bibInput.trim()) {
      const ok = window.confirm('Clear the current bib and switch input modes?')
      if (!ok) return
      setBibInput('')
      setPreview(null)
    }

    setInputMode(nextMode)
    setBibEntryActive(false)

    setTimeout(() => {
      if (nextMode === 'bib_first') inputRef.current?.focus()
    }, 0)
  }, [inputMode, bibInput])

  const captureLap = useCallback(async () => {
    if (!canCapture || savingLap || !raceStart) return

    const nowTs = Date.now()
    if (repeatGuardMs > 0 && nowTs - lastCaptureAtRef.current < repeatGuardMs) {
      setTransientMessage('Repeat tap blocked', 900)
      return
    }

    const activeBib = bibInput.trim()
    const isBibFirst = inputMode === 'bib_first'

    if (isBibFirst && !activeBib) {
      window.alert('Enter a bib number first.')
      inputRef.current?.focus()
      return
    }

    if (isBibFirst && activeBib) {
      const duplicateExists = laps.some(
        l => l.status !== 'void' && l.bib_number === activeBib
      )

      if (duplicateExists) {
        const ok = window.confirm(
          `Bib ${activeBib} is already recorded at this checkpoint. Capture again anyway?`
        )
        if (!ok) {
          refocusBibInput()
          return
        }
      }
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

    pushLastAction({
      type: 'capture',
      status: 'syncing',
      lapId: local_id,
      bib_number: row.bib_number || null,
      name: row.bib_number ? getEntryDisplayName(row.bib_number) : 'Pending tap',
      team: row.bib_number ? getEntryTeam(row.bib_number) : '',
      elapsed_ms: row.elapsed_ms,
      detail: row.bib_number ? 'Recording checkpoint…' : 'Recording pending tap…',
    })

    const { data, error } = await supabase.from('lap_events').insert(row).select().single()

    if (!error && data) {
      setLaps(prev =>
        prev
          .filter(x => x.id !== local_id)
          .concat(data)
          .sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at))
      )

      pushLastAction({
        type: 'capture',
        status: 'saved',
        lapId: data.id,
        bib_number: data.bib_number || null,
        name: data.bib_number ? getEntryDisplayName(data.bib_number) : 'Pending tap',
        team: data.bib_number ? getEntryTeam(data.bib_number) : '',
        elapsed_ms: data.elapsed_ms,
        detail: data.bib_number ? 'Checkpoint saved' : 'Tap saved — assign bib next',
      })
    } else {
      const pendingLocal = loadPendingLocal(eventId, checkpointId)
      pendingLocal.push({ type: 'insert', local_id, ...row })
      savePendingLocal(eventId, checkpointId, pendingLocal)

      pushLastAction({
        type: 'capture',
        status: 'local',
        lapId: local_id,
        bib_number: row.bib_number || null,
        name: row.bib_number ? getEntryDisplayName(row.bib_number) : 'Pending tap',
        team: row.bib_number ? getEntryTeam(row.bib_number) : '',
        elapsed_ms: row.elapsed_ms,
        detail: 'Saved locally — waiting to sync',
      })

      setTransientMessage(isBibFirst ? 'Checkpoint saved locally, waiting to sync' : 'Tap saved locally, waiting to sync', 2200)
    }

    if (isBibFirst) {
      setBibInput('')
      setPreview(null)
      setTimeout(() => refocusBibInput(), 0)
    } else {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 0)
    }

    setSavingLap(false)
  }, [
    canCapture,
    savingLap,
    raceStart,
    repeatGuardMs,
    bibInput,
    inputMode,
    laps,
    entries,
    eventId,
    checkpointId,
    getEntryDisplayName,
    getEntryTeam,
    pushLastAction,
    refocusBibInput,
    setTransientMessage,
  ])

  const assignBib = useCallback(async () => {
    const bib = bibInput.trim()
    if (!bib || !nextPending || savingAssign) return

    const entry = entries[bib]
    setSavingAssign(true)

    const update = {
      bib_number: bib,
      entry_id: entry?.id ?? null,
      assigned_at: new Date().toISOString(),
      status: 'assigned',
      is_corrected: true,
    }

    setLaps(prev => prev.map(l => (l.id === nextPending.id ? { ...l, ...update } : l)))

    pushLastAction({
      type: 'assign',
      status: 'syncing',
      lapId: nextPending.id,
      bib_number: bib,
      name: getEntryDisplayName(bib),
      team: getEntryTeam(bib),
      elapsed_ms: nextPending.elapsed_ms,
      detail: 'Assigning bib to pending tap…',
    })

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

      pushLastAction({
        type: 'assign',
        status: 'local',
        lapId: nextPending.id,
        bib_number: bib,
        name: getEntryDisplayName(bib),
        team: getEntryTeam(bib),
        elapsed_ms: nextPending.elapsed_ms,
        detail: 'Assignment saved locally — waiting to sync',
      })

      setTransientMessage('Assignment saved locally, waiting to sync', 2000)
    } else {
      pushLastAction({
        type: 'assign',
        status: 'saved',
        lapId: nextPending.id,
        bib_number: bib,
        name: getEntryDisplayName(bib),
        team: getEntryTeam(bib),
        elapsed_ms: nextPending.elapsed_ms,
        detail: 'Bib assigned',
      })

      setTransientMessage(`Assigned bib ${bib}`, 1500)
    }

    setBibInput('')
    setPreview(null)
    setSavingAssign(false)
    refocusBibInput()
  }, [
    bibInput,
    nextPending,
    savingAssign,
    entries,
    eventId,
    checkpointId,
    getEntryDisplayName,
    getEntryTeam,
    pushLastAction,
    refocusBibInput,
    setTransientMessage,
  ])
  const runPrimaryAction = useCallback(() => {
    const bib = bibInput.trim()

    if (inputMode === 'capture_first') {
      if (canCapture) {
        captureLap()
        return
      }
    }

    if (inputMode === 'bib_first') {
      if (bib && canCapture) {
        captureLap()
        return
      }
    }
  }, [bibInput, inputMode, canCapture, captureLap])

  const voidLastPending = useCallback(async () => {
    const target = [...pending].reverse()[0]
    if (!target || !isAdmin) return

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

      pushLastAction({
        type: 'void',
        status: 'local',
        lapId: target.id,
        bib_number: null,
        name: 'Pending tap',
        team: '',
        elapsed_ms: target.elapsed_ms,
        detail: 'Void saved locally — waiting to sync',
      })

      setTransientMessage('Void saved locally, waiting to sync', 1600)
    } else {
      pushLastAction({
        type: 'void',
        status: 'saved',
        lapId: target.id,
        bib_number: null,
        name: 'Pending tap',
        team: '',
        elapsed_ms: target.elapsed_ms,
        detail: 'Most recent pending tap voided',
      })

      setTransientMessage('Last pending tap voided', 1500)
    }
  }, [pending, eventId, checkpointId, isAdmin, pushLastAction, setTransientMessage])

const undoLastCheckpoint = useCallback(async () => {
  const targetId = lastAction?.lapId
  if (!targetId) return

  const target = laps.find(l => l.id === targetId)
  if (!target || target.status === 'void') return

  const update = {
    status: 'void',
    is_corrected: true,
    correction_note: 'Undo last checkpoint from timer',
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

    pushLastAction({
      type: 'undo',
      status: 'local',
      lapId: target.id,
      bib_number: target.bib_number || null,
      name: target.bib_number ? getEntryDisplayName(target.bib_number) : 'Pending tap',
      team: target.bib_number ? getEntryTeam(target.bib_number) : '',
      elapsed_ms: target.elapsed_ms,
      detail: 'Undo saved locally — waiting to sync',
    })

    setTransientMessage('Undo saved locally, waiting to sync', 1800)
  } else {
    pushLastAction({
      type: 'undo',
      status: 'saved',
      lapId: target.id,
      bib_number: target.bib_number || null,
      name: target.bib_number ? getEntryDisplayName(target.bib_number) : 'Pending tap',
      team: target.bib_number ? getEntryTeam(target.bib_number) : '',
      elapsed_ms: target.elapsed_ms,
      detail: 'Last action undone',
    })

    setTransientMessage('Last action undone', 1500)
  }
}, [
  lastAction,
  laps,
  eventId,
  checkpointId,
  getEntryDisplayName,
  getEntryTeam,
  pushLastAction,
  setTransientMessage,
])


  const voidLap = useCallback(async (lap) => {
    if (!isAdmin) return

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

      pushLastAction({
        type: 'void',
        status: 'local',
        lapId: lap.id,
        bib_number: lap.bib_number || null,
        name: lap.bib_number ? getEntryDisplayName(lap.bib_number) : 'Pending tap',
        team: lap.bib_number ? getEntryTeam(lap.bib_number) : '',
        elapsed_ms: lap.elapsed_ms,
        detail: 'Void saved locally — waiting to sync',
      })

      setTransientMessage('Void saved locally, waiting to sync', 1600)
    } else {
      pushLastAction({
        type: 'void',
        status: 'saved',
        lapId: lap.id,
        bib_number: lap.bib_number || null,
        name: lap.bib_number ? getEntryDisplayName(lap.bib_number) : 'Pending tap',
        team: lap.bib_number ? getEntryTeam(lap.bib_number) : '',
        elapsed_ms: lap.elapsed_ms,
        detail: 'Lap voided',
      })

      setTransientMessage('Lap voided', 1400)
    }
  }, [eventId, checkpointId, isAdmin, getEntryDisplayName, getEntryTeam, pushLastAction, setTransientMessage])

  const restoreLap = useCallback(async (lap) => {
    if (!isAdmin) return

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

      pushLastAction({
        type: 'undo',
        status: 'local',
        lapId: lap.id,
        bib_number: null,
        name: 'Pending tap',
        team: '',
        elapsed_ms: lap.elapsed_ms,
        detail: 'Restore saved locally — waiting to sync',
      })

      setTransientMessage('Restore saved locally, waiting to sync', 1600)
    } else {
      pushLastAction({
        type: 'undo',
        status: 'saved',
        lapId: lap.id,
        bib_number: null,
        name: 'Pending tap',
        team: '',
        elapsed_ms: lap.elapsed_ms,
        detail: 'Lap restored to pending',
      })

      setTransientMessage('Lap restored to pending', 1500)
    }
  }, [eventId, checkpointId, isAdmin, pushLastAction, setTransientMessage])

  const saveEditedBib = useCallback(async (lap) => {
    if (!isAdmin) return

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

    pushLastAction({
      type: 'assign',
      status: 'saved',
      lapId: lap.id,
      bib_number: bib || null,
      name: bib ? getEntryDisplayName(bib) : 'Pending tap',
      team: bib ? getEntryTeam(bib) : '',
      elapsed_ms: lap.elapsed_ms,
      detail: bib ? 'Bib updated' : 'Bib cleared — tap returned to pending',
    })

    setEditingLapId(null)
    setEditingBib('')
  }, [editingBib, entries, laps, isAdmin, getEntryDisplayName, getEntryTeam, pushLastAction])

  useEffect(() => {
  const isTextInput = el => {
    if (!el) return false
    const tag = el.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
  }

  const h = e => {
    const active = document.activeElement
    const inInput = isTextInput(active)
    const bib = bibInput.trim()

    // Space = do the main action when not typing in a field
    if (e.code === 'Space') {
    if (inputMode === 'capture_first' && canCapture) {
      e.preventDefault()
      captureLap()
      return
    }

    if (!inInput) {
      e.preventDefault()
      runPrimaryAction()
      return
    }
  }

    // Enter = submit current bib workflow
    if (e.key === 'Enter') {
      if (bib) {
        e.preventDefault()

        if (inputMode === 'capture_first' && nextPending) {
          assignBib()
          return
        }

        if (inputMode === 'bib_first' && canCapture) {
          captureLap()
          return
        }
      }
    }

    // Escape = clear bib field
    if (e.key === 'Escape') {
      if (bib) {
        e.preventDefault()
        setBibInput('')
        setPreview(null)
        refocusBibInput()
      }
      return
    }

    // If user types while not focused in an input, route it into bib field
    const isSingleChar = e.key.length === 1
    const isTypingChar = /^[0-9]$/.test(e.key)

    if (!inInput && isSingleChar && isTypingChar) {
      e.preventDefault()
      setBibInput(prev => `${prev}${e.key}`)
      setBibEntryActive(true)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
      return
    }

    // Backspace edits bib even if input isn't focused
    if (!inInput && e.key === 'Backspace') {
      if (bibInput.length > 0) {
        e.preventDefault()
        setBibInput(prev => prev.slice(0, -1))
        requestAnimationFrame(() => {
          inputRef.current?.focus()
        })
      }
    }
  }

  window.addEventListener('keydown', h)
  return () => window.removeEventListener('keydown', h)
}, [
  bibInput,
  inputMode,
  nextPending,
  canCapture,
  assignBib,
  captureLap,
  runPrimaryAction,
  refocusBibInput,
])

  const lastActionTone = getLastActionTone()

  return (
    <div style={{ minHeight: '100dvh', background: T.bg, color: T.text, fontFamily: FB, display: 'flex', flexDirection: 'column' }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />

      {isAdmin ? (
        <>
          <div
            style={{
              padding: '10px 14px',
              borderBottom: `1px solid ${T.border}`,
              background: T.pageAlt,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '72px 1fr 1fr',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <button
                onClick={() => navigate(`/race/${eventId}/checkpoints`)}
                style={{
                  background: 'none',
                  border: `1px solid ${T.border2}`,
                  color: T.muted2,
                  borderRadius: 8,
                  padding: '8px 10px',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: F,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  minHeight: 40,
                }}
              >
                ← Back
              </button>

              <div style={{ textAlign: 'center', minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 34,
                    fontWeight: 900,
                    letterSpacing: -1,
                    color: event?.race_started_at ? T.textStrong : T.dim,
                    fontVariantNumeric: 'tabular-nums',
                    fontFamily: F,
                    lineHeight: 1,
                  }}
                >
                  {fmt(elapsed)}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: syncing ? T.warning : T.dim,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    marginTop: 2,
                  }}
                >
                  {event?.status === 'finished' ? 'Race finished' : canCapture ? 'Race active' : 'Waiting'}
                </div>
              </div>

              <div style={{ textAlign: 'right', minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 900,
                    color: T.textStrong,
                    fontFamily: F,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {checkpoint?.name || 'Checkpoint'}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: T.warning,
                    letterSpacing: 1.5,
                    fontFamily: F,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    marginTop: 3,
                  }}
                >
                  CP {checkpoint?.checkpoint_order ?? '—'}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: T.textStrong,
                    fontFamily: F,
                    fontWeight: 700,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                  }}
                >
                  Checkpoints · {checkpointCount}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: T.muted,
                    marginTop: 2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '60vw',
                  }}
                >
                  {event?.name}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <div
                  style={{
                    ...statusPill(currentSaveState.tone),
                    padding: '6px 10px',
                    borderRadius: 999,
                    fontSize: 10,
                    fontFamily: F,
                    fontWeight: 800,
                    letterSpacing: 1.1,
                    textTransform: 'uppercase',
                  }}
                >
                  {currentSaveState.label}
                </div>

                <button style={themeBtn(theme === 'light')} onClick={() => setTheme('light')}>
                  ☀ Light
                </button>
                <button style={themeBtn(theme === 'dark')} onClick={() => setTheme('dark')}>
                  🌙 Dark
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, background: T.pageAlt }}>
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
                  color: mobileTab === tab ? T.warning : T.dim,
                  borderBottom: mobileTab === tab ? `2px solid ${T.warning}` : '2px solid transparent',
                }}
              >
                {tab === 'timer'
                  ? `⏱ Timer${pending.length ? ` (${pending.length})` : ''}`
                  : `📋 Recent (${filteredRecentLaps.length})`}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div
          style={{
            padding: '18px 16px 14px',
            borderBottom: `1px solid ${T.border}`,
            background: T.pageAlt,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 'clamp(28px, 6vw, 40px)',
              fontWeight: 900,
              color: T.textStrong,
              fontFamily: F,
              lineHeight: 1,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            {checkpoint?.name || 'Checkpoint'}
          </div>

          <div
            style={{
              marginTop: 8,
              fontSize: 'clamp(40px, 9vw, 64px)',
              fontWeight: 900,
              letterSpacing: -1.5,
              color: event?.race_started_at ? T.textStrong : T.dim,
              fontVariantNumeric: 'tabular-nums',
              fontFamily: F,
              lineHeight: 1,
            }}
          >
            {fmt(elapsed)}
          </div>

          <div
            style={{
              marginTop: 8,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              ...statusPill(currentSaveState.tone),
              borderRadius: 999,
              padding: '6px 10px',
              fontSize: 10,
              fontFamily: F,
              fontWeight: 800,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
            }}
          >
            {currentSaveState.label}
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div
          className="timer-panel"
          style={{
            width: isAdmin ? 440 : '100%',
            flex: 1,
            flexShrink: 0,
            borderRight: isAdmin ? `1px solid ${T.border}` : 'none',
            display: isAdmin ? (mobileTab === 'timer' ? 'flex' : 'none') : 'flex',
            flexDirection: 'column',
            background: T.bg,
            maxWidth: isAdmin ? 440 : '100%',
            margin: isAdmin ? 0 : '0 auto',
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

            <div style={{ textAlign: 'center', fontSize: 11, color: T.muted, minHeight: 18, marginBottom: 10 }}>
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
                  border: `1px solid ${T.warningBorder}`,
                  background: T.warningBg,
                  padding: '12px 14px',
                }}
              >
                <div style={{ fontSize: 11, color: T.warning, fontFamily: F, fontWeight: 900, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                  {pending.length} Unassigned {pending.length === 1 ? 'Tap' : 'Taps'}
                </div>
                <div style={{ marginTop: 4, fontSize: 18, color: T.textStrong, fontFamily: F, fontWeight: 900 }}>
                  Awaiting Bib: {nextPending ? fmt(nextPending.elapsed_ms, true) : '—'}
                </div>
                <div style={{ marginTop: 3, fontSize: 11, color: T.muted }}>
                  Assign bibs before more taps are missed.
                </div>
              </div>
            )}

            {inputMode === 'capture_first' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: T.dim, textTransform: 'uppercase', letterSpacing: 2, fontFamily: F, fontWeight: 700, marginBottom: 6 }}>
                  Assign next bib
                </div>

                <div style={{ minHeight: 18, margin: '0 0 8px', fontSize: 12 }}>
                  {preview?.found && (
                    <span style={{ color: T.successBright }}>
                      ✓ {preview.name}{preview.team ? ` · ${preview.team}` : ''}
                    </span>
                  )}
                  {preview && !preview.found && (
                    <span style={{ color: T.warning }}>⚠ Not in roster</span>
                  )}
                  {duplicateBibAtCheckpoint && (
                    <span style={{ color: T.danger, marginLeft: 8 }}>
                      ⚠ Bib already recorded at this checkpoint
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 18, color: nextPending ? T.textStrong : T.muted2, marginBottom: 8, fontFamily: F, fontWeight: 900 }}>
                  {nextPending ? `Awaiting Bib · ${fmt(nextPending.elapsed_ms, true)}` : 'No pending laps'}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    ref={inputRef}
                    type="number"
                    inputMode="numeric"
                    value={bibInput}
                    onFocus={() => setBibEntryActive(true)}
                    onChange={e => setBibInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') assignBib()
                    }}
                    placeholder="Bib #"
                    disabled={!nextPending}
                    style={{
                      flex: 1,
                      height: 58,
                      background: T.inputBg,
                      border: `1px solid ${T.inputBorder}`,
                      borderRadius: 12,
                      color: T.textStrong,
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
                    onPointerDown={e => e.preventDefault()}
                    onClick={showAssignMainButton ? captureLap : assignBib}
                    disabled={
                      showAssignMainButton
                        ? !canCapture
                        : (!bibInput.trim() || !nextPending || savingAssign)
                    }
                    style={{
                      width: 100,
                      height: 58,
                      background: showAssignMainButton ? T.accent : T.success,
                      border: 'none',
                      borderRadius: 12,
                      color: T.buttonText,
                      fontSize: 15,
                      fontWeight: 900,
                      cursor:
                        showAssignMainButton
                          ? (canCapture ? 'pointer' : 'not-allowed')
                          : (!bibInput.trim() || !nextPending || savingAssign ? 'not-allowed' : 'pointer'),
                      fontFamily: F,
                      letterSpacing: 1.2,
                      opacity:
                        showAssignMainButton
                          ? (canCapture ? 1 : 0.35)
                          : (!bibInput.trim() || !nextPending || savingAssign ? 0.35 : 1),
                      textTransform: 'uppercase',
                    }}
                  >
                    {showAssignMainButton
                      ? 'Lap'
                      : savingAssign
                        ? '…'
                        : 'Assign'}
                  </button>
                </div>
              </div>
            )}

            {inputMode === 'bib_first' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ minHeight: 18, margin: '0 0 8px', fontSize: 12 }}>
                  {preview?.found && (
                    <span style={{ color: T.successBright }}>
                      ✓ {preview.name}{preview.team ? ` · ${preview.team}` : ''}
                    </span>
                  )}
                  {preview && !preview.found && (
                    <span style={{ color: T.warning }}>⚠ Not in roster</span>
                  )}
                  {duplicateBibAtCheckpoint && (
                    <span style={{ color: T.danger, marginLeft: 8 }}>⚠ Bib already recorded at this checkpoint</span>
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
                    background: T.inputBg,
                    border: `1px solid ${T.inputBorder}`,
                    borderRadius: 12,
                    color: T.textStrong,
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

            <div
              className="capture-row"
              style={{
                display: 'grid',
                gridTemplateColumns: '92px minmax(0, 1fr) 0.95fr',
                gap: 12,
                alignItems: 'stretch',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  alignItems: 'stretch',
                }}
              >
                <button
                  onPointerDown={e => {
                    e.preventDefault()
                    if (showAssignMainButton) {
                      assignBib()
                    } else if (canCapture) {
                      captureLap()
                    }
                  }}
                  disabled={
                    showAssignMainButton
                      ? (!bibInput.trim() || !nextPending || savingAssign)
                      : (!canCapture || (inputMode === 'bib_first' && !bibInput.trim()))
                  }
                  style={{
                    width: '100%',
                    minHeight: 112,
                    borderRadius: 18,
                    border: 'none',
                    background: showAssignMainButton
                      ? T.success
                      : !canCapture
                        ? T.dim
                        : flash
                          ? T.flash
                          : inputMode === 'bib_first'
                            ? T.accentAlt
                            : T.accent,
                    color: T.buttonText,
                    fontSize: 22,
                    fontWeight: 900,
                    letterSpacing: 1.8,
                    cursor:
                      showAssignMainButton
                        ? (!bibInput.trim() || !nextPending || savingAssign ? 'not-allowed' : 'pointer')
                        : (canCapture && !(inputMode === 'bib_first' && !bibInput.trim()) ? 'pointer' : 'not-allowed'),
                    fontFamily: F,
                    textTransform: 'uppercase',
                    transform: flash ? 'scale(0.97)' : 'scale(1)',
                    transition: 'background 0.08s, transform 0.08s',
                    touchAction: 'manipulation',
                    opacity:
                      showAssignMainButton
                        ? (!bibInput.trim() || !nextPending || savingAssign ? 0.6 : 1)
                        : (canCapture && !(inputMode === 'bib_first' && !bibInput.trim()) ? 1 : 0.6),
                  }}
                >
                  {showAssignMainButton
                    ? (savingAssign ? 'Assign…' : 'Assign')
                    : event?.status === 'finished'
                      ? 'Ended'
                      : !canCapture
                        ? 'Waiting'
                        : inputMode === 'bib_first'
                          ? (bibInput.trim() ? `Bib ${bibInput.trim()}` : 'Tap')
                          : 'Lap'}
                </button>
              </div>

              <div
                style={{
                  borderRadius: 16,
                  border: `1px solid ${T.border2}`,
                  background: T.panel,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 164,
                }}
              >
                <div style={{ fontSize: 10, color: T.muted2, textTransform: 'uppercase', letterSpacing: 2, fontFamily: F, fontWeight: 700 }}>
                  Checkpoint Summary
                </div>

                <div style={{ marginTop: 10 }}>
                  <div
                    style={{
                      fontSize: 40,
                      lineHeight: 1,
                      fontWeight: 900,
                      color: T.textStrong,
                      fontFamily: F,
                    }}
                  >
                    {checkpointCount}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      color: T.muted,
                      textTransform: 'uppercase',
                      letterSpacing: 1.4,
                      fontFamily: F,
                      fontWeight: 700,
                    }}
                  >
                    Recorded Checkpoints
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 10, color: T.muted2, textTransform: 'uppercase', letterSpacing: 1.4, fontFamily: F, fontWeight: 700 }}>
                    Last Time
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 24,
                      lineHeight: 1,
                      fontWeight: 900,
                      color: T.textStrong,
                      fontFamily: F,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {lastActiveLap ? fmt(lastActiveLap.elapsed_ms, true) : '—'}
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderRadius: 16,
                  border: `1px solid ${T.border2}`,
                  background: T.panel,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 164,
                }}
              >
                <div style={{ fontSize: 10, color: T.muted2, textTransform: 'uppercase', letterSpacing: 2, fontFamily: F, fontWeight: 700 }}>
                  Last Captures
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {recentCaptured.length === 0 ? (
                    <div style={{ color: T.dim, fontSize: 14, textAlign: 'center', paddingTop: 20 }}>
                      No taps yet
                    </div>
                  ) : (
                    recentCaptured.slice(0, 3).map((l, idx) => {
                      const label = idx === 0 ? 'Last' : idx === 1 ? 'Prev' : 'Earlier'
                      const bib = l.bib_number || '—'
                      const name = l.bib_number ? getEntryDisplayName(l.bib_number) : 'Pending tap'

                      return (
                        <div key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 10, color: idx === 0 ? T.successBright : T.muted2, textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: F, fontWeight: 800 }}>
                              {label}
                            </span>
                            <span
                              style={{
                                fontSize: idx === 0 ? 24 : 18,
                                color: T.textStrong,
                                fontWeight: 900,
                                fontFamily: F,
                                lineHeight: 1,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {fmt(l.elapsed_ms, true)}
                            </span>
                          </div>

                          <div style={{ fontSize: 12, color: T.textStrong, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            Bib {bib} · {name}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                <div style={{ textAlign: 'center', fontSize: 11, color: T.muted2, marginTop: 10 }}>
                  {showAssignMainButton
                    ? 'Assign bib to the next pending lap'
                    : event?.status === 'finished'
                      ? 'Race ended'
                      : !canCapture
                        ? 'Waiting for official race start'
                        : inputMode === 'bib_first'
                          ? `Checkpoint ${checkpoint?.checkpoint_order ?? ''} · Enter bib then tap`
                          : `Checkpoint ${checkpoint?.checkpoint_order ?? ''} · Tap or spacebar`}
                </div>
              </div>
            </div>

            {lastAction && lastActionTone && (
              <div
                style={{
                  marginTop: 12,
                  marginBottom: 8,
                  borderRadius: 14,
                  border: statusPill(lastActionTone.tone).border,
                  background: statusPill(lastActionTone.tone).background,
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: statusPill(lastActionTone.tone).color,
                    fontFamily: F,
                    fontWeight: 900,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                  }}
                >
                  {lastActionTone.icon} {lastActionTone.title}
                </div>

                <div
                  style={{
                    marginTop: 6,
                    fontSize: 24,
                    color: T.textStrong,
                    fontFamily: F,
                    fontWeight: 900,
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmt(lastAction.elapsed_ms, true)}
                </div>

                <div style={{ marginTop: 4, fontSize: 14, color: T.textStrong, fontWeight: 700 }}>
                  {lastAction.name}
                  {lastAction.bib_number ? ` · Bib ${lastAction.bib_number}` : ''}
                </div>

                {!!lastAction.team && (
                  <div style={{ marginTop: 2, fontSize: 12, color: T.muted }}>
                    {lastAction.team}
                  </div>
                )}

                <div style={{ marginTop: 5, fontSize: 12, color: T.muted }}>
                  {lastAction.detail}
                </div>

                {(lastAction.type === 'capture' || lastAction.type === 'assign') && undoTarget && (
  <div style={{ marginTop: 10 }}>
    {!confirmUndoOpen ? (
      <button
        onClick={() => setConfirmUndoOpen(true)}
        style={{
          height: 34,
          padding: '0 12px',
          borderRadius: 999,
          border: `1px solid ${T.dangerBorder}`,
          background: 'transparent',
          color: T.danger,
          fontFamily: F,
          fontWeight: 800,
          fontSize: 11,
          letterSpacing: 1.1,
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        Undo Bib {undoTarget.bib_number || 'Tap'}
      </button>
    ) : (
      <div
        style={{
          marginTop: 2,
          borderRadius: 12,
          border: `1px solid ${T.warningBorder}`,
          background: T.warningBg,
          padding: '12px 14px',
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: T.warning,
            fontFamily: F,
            fontWeight: 900,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
          }}
        >
          Confirm Undo
        </div>

        <div style={{ marginTop: 6, fontSize: 15, color: T.textStrong, fontWeight: 700 }}>
          Undo last capture for {undoTarget.bib_number ? `Bib ${undoTarget.bib_number}` : 'pending tap'}?
        </div>

        <div style={{ marginTop: 4, fontSize: 12, color: T.muted }}>
          Time: {fmt(undoTarget.elapsed_ms, true)}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            onClick={() => setConfirmUndoOpen(false)}
            style={{
              flex: 1,
              height: 36,
              borderRadius: 10,
              border: `1px solid ${T.border2}`,
              background: T.panel2,
              color: T.textStrong,
              fontFamily: F,
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          <button
            onClick={async () => {
              setConfirmUndoOpen(false)
              await undoLastCheckpoint()
            }}
            style={{
              flex: 1,
              height: 36,
              borderRadius: 10,
              border: `1px solid ${T.dangerBorder}`,
              background: T.danger,
              color: T.buttonText,
              fontFamily: F,
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Confirm Undo
          </button>
        </div>
      </div>
    )}
  </div>
)}
              </div>
            )}

            {message && (
              <div style={{ marginTop: 6, textAlign: 'center', fontSize: 11, color: T.warning }}>
                {message}
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', borderTop: `1px solid ${T.faint}` }}>
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
                  color: T.dim,
                  textTransform: 'uppercase',
                  letterSpacing: 2,
                  fontFamily: F,
                  fontWeight: 700,
                }}
              >
                Pending ({pending.length})
              </div>

              {isAdmin && inputMode === 'capture_first' && (
                <button
                  onClick={voidLastPending}
                  disabled={pending.length === 0}
                  style={{
                    height: 26,
                    padding: '0 10px',
                    borderRadius: 999,
                    border: `1px solid ${T.dangerBorder}`,
                    background: 'transparent',
                    color: pending.length ? T.danger : T.dim,
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
              )}
            </div>

            <div
              style={{
                padding: '0 14px 6px',
                fontSize: 10,
                color: T.muted2,
                lineHeight: 1.3,
              }}
            >
              {isAdmin
                ? 'Voided taps can be restored from the Recent tab.'
                : 'Assign bibs to pending taps as racers are identified.'}
            </div>

            {pending.length === 0 ? (
              <div style={{ padding: '20px 14px', color: T.dim, fontSize: 12, textAlign: 'center' }}>
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
                    borderBottom: `1px solid ${T.faint}`,
                    background: i === 0 ? T.pendingNext : 'transparent',
                  }}
                >
                  <span style={{ color: T.dim, width: 40, fontSize: 11, fontFamily: F }}>
                    {i === 0 ? 'NEXT' : `${i + 1}`}
                  </span>
                  <span style={{ color: T.textStrong, fontWeight: 900, flex: 1, fontSize: 20, fontVariantNumeric: 'tabular-nums', fontFamily: F }}>
                    {fmt(l.elapsed_ms, true)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {isAdmin && (
          <div
            className="recent-panel"
            style={{
              flex: 1,
              display: mobileTab === 'recent' ? 'flex' : 'none',
              flexDirection: 'column',
              overflow: 'hidden',
              background: T.bg,
            }}
          >
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, background: T.pageAlt }}>
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
                borderBottom: `1px solid ${T.border}`,
                fontSize: 9,
                color: T.dim,
                textTransform: 'uppercase',
                letterSpacing: 1.5,
                fontFamily: F,
                fontWeight: 700,
                flexShrink: 0,
                background: T.pageAlt,
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
                <div style={{ textAlign: 'center', color: T.dim, padding: '48px 0', fontSize: 13 }}>
                  No laps in this filter
                </div>
              ) : (
                filteredRecentLaps.map((l, i) => {
                  const entry = l.bib_number ? entries[l.bib_number] : null
                  const name = entry
                    ? (`${entry.first_name ?? ''}${entry.last_name ? ` ${entry.last_name}` : ''}`.trim() || entry.team || null)
                    : null
                  const isPending = isPendingLap(l)

                  return (
                    <div
                      key={l.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '90px 70px 1fr 90px 96px',
                        padding: '8px 14px',
                        borderBottom: `1px solid ${T.faint}`,
                        background: l.status === 'void' ? T.voidBg : isPending ? T.pendingBg : i % 2 === 0 ? 'transparent' : T.zebra,
                        opacity: l.status === 'void' ? 0.7 : isPending ? 0.95 : 1,
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.textStrong, fontVariantNumeric: 'tabular-nums', fontFamily: F }}>
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
                            background: T.inputBg,
                            border: `1px solid ${T.warning}`,
                            borderRadius: 6,
                            color: T.textStrong,
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
                            color: l.bib_number ? T.warning : T.dim,
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

                      <span style={{ fontSize: 13, color: name ? T.text : T.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name ?? (l.status === 'void' ? 'voided' : isPending ? 'awaiting bib' : 'not in roster')}
                      </span>

                      <span style={{ fontSize: 11, color: l.status === 'void' ? T.danger : isPending ? T.warning : T.successBright, textTransform: 'uppercase', letterSpacing: 1 }}>
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
                              border: `1px solid ${T.success}`,
                              background: 'transparent',
                              color: T.success,
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
                              border: `1px solid ${T.dangerBorder}`,
                              background: 'transparent',
                              color: T.danger,
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
        )}
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
            grid-template-columns: 92px 1fr !important;
          }
        }

        @media (max-width: 640px) {
          .capture-row {
            grid-template-columns: 84px 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}