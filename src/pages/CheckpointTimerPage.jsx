import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getRaceElapsedMs } from '../lib/raceClock'
import {
  loadRaceEventLocal,
  clearRaceEventLocal,
  mergeEventWithLocal,
} from '../lib/raceEventLocalState'

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

export default function CheckpointTimerPage() {
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

  const [repeatGuardMs, setRepeatGuardMs] = useState(0)
  const [recentFilter, setRecentFilter] = useState('all')
  const [theme, setTheme] = useState('light')

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

  const checkpointName = String(checkpoint?.name || '').trim().toLowerCase()
  const isFinishCheckpoint =
    checkpointName === 'finish' ||
    checkpointName.includes('finish') ||
    checkpointName.includes('finish line')

  const captureLabel = isFinishCheckpoint ? 'Finish' : 'Lap'
  const checkpointSummaryLabel = isFinishCheckpoint ? 'Finish Summary' : 'Checkpoint Summary'
  const recordedCountLabel = isFinishCheckpoint ? 'Recorded Finishers' : 'Recorded Checkpoints'
  const pendingLabel = isFinishCheckpoint ? 'Pending Finish Assignments' : 'Pending'
  const actionWaitingLabel = isFinishCheckpoint ? 'No pending finishers' : 'No pending laps'

  const pillBtn = active => ({
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
    return { tone: 'success', icon: '✓', title: isFinishCheckpoint ? 'Last Finish Capture' : 'Last Capture' }
  }, [lastAction, isFinishCheckpoint])

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
    localStorage.setItem(getRepeatGuardStorageKey(checkpointId), String(repeatGuardMs))
  }, [checkpointId, repeatGuardMs])

  useEffect(() => {
    if (!checkpointId) return
    localStorage.setItem(getThemeStorageKey(checkpointId), theme)
  }, [checkpointId, theme])

  useEffect(() => {
    if (!eventId || !checkpointId) return

    setEvent(null)
    setCheckpoint(null)
    setEntries({})
    setLaps([])
    setRaceStart(null)
    setElapsed(0)
    setBibInput('')
    setPreview(null)
    setEditingLapId(null)
    setEditingBib('')
    setLastAction(null)
    setConfirmUndoOpen(false)

    deviceIdRef.current = getDeviceId()

    async function load() {
      const [
        { data: eventData },
        { data: checkpointData },
        { data: entryData },
        { data: lapData },
      ] = await Promise.all([
        supabase.from('race_events').select('*').eq('id', eventId).single(),
        supabase
          .from('race_checkpoints')
          .select('*')
          .eq('id', checkpointId)
          .eq('event_id', eventId)
          .single(),
        supabase.from('event_entries').select('*').eq('event_id', eventId),
        supabase
          .from('lap_events')
          .select('*')
          .eq('event_id', eventId)
          .eq('checkpoint_id', checkpointId)
          .order('captured_at', { ascending: true }),
      ])

      const localPending = loadRaceEventLocal(eventId)
      const mergedEvent = mergeEventWithLocal(eventData || null, localPending)

      setEvent(mergedEvent || null)
      setCheckpoint(checkpointData || null)

      if (mergedEvent?.race_started_at) {
        setRaceStart(new Date(mergedEvent.race_started_at).getTime())
      } else {
        setRaceStart(null)
        setElapsed(0)
      }

      const map = {}
      ;(entryData || []).forEach(e => {
        map[e.bib_number] = e
      })
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
          const localPending = loadRaceEventLocal(eventId)
          const mergedEvent = mergeEventWithLocal(payload.new, localPending)

          setEvent(mergedEvent)

          if (mergedEvent?.race_started_at) {
            setRaceStart(new Date(mergedEvent.race_started_at).getTime())
          } else {
            setRaceStart(null)
            setElapsed(0)
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
      const localRaceEvent = loadRaceEventLocal(eventId)

      if (localRaceEvent?.type === 'start_race') {
        const { data: syncedEvent, error: eventSyncError } = await supabase
          .from('race_events')
          .update({
            status: 'active',
            race_started_at: localRaceEvent.race_started_at,
            race_finished_at: null,
          })
          .eq('id', eventId)
          .select()
          .single()

        if (!eventSyncError && syncedEvent) {
          clearRaceEventLocal(eventId)
          setEvent(syncedEvent)

          if (syncedEvent?.race_started_at) {
            setRaceStart(new Date(syncedEvent.race_started_at).getTime())
          } else {
            setRaceStart(null)
            setElapsed(0)
          }
        }
      }

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

  const activeOrderedLaps = useMemo(() => {
    return laps
      .filter(l => l.status !== 'void')
      .sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at))
  }, [laps])

  const activePlaceByLapId = useMemo(() => {
    const map = {}
    activeOrderedLaps.forEach((lap, idx) => {
      map[lap.id] = idx + 1
    })
    return map
  }, [activeOrderedLaps])

  const nextPending = pending[0] || null

  const undoTarget = useMemo(() => {
    if (!lastAction?.lapId) return null
    return laps.find(l => l.id === lastAction.lapId && l.status !== 'void') || null
  }, [lastAction, laps])

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
    if (nextPending) return { label: 'Assigning', tone: 'info' }
    if (event?.status === 'finished') return { label: 'Race finished', tone: 'default' }
    if (event?.status === 'results_review') return { label: 'Results review', tone: 'warning' }
    return { label: 'Waiting', tone: 'default' }
  }, [eventId, checkpointId, syncing, canCapture, event?.status, nextPending])

  const lastActionTone = getLastActionTone()

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
    detail: isFinishCheckpoint
      ? 'Assigning bib to pending finisher…'
      : 'Assigning bib to pending tap…',
  })

  const { error } = await supabase
    .from('lap_events')
    .update(update)
    .eq('id', nextPending.id)

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
  isFinishCheckpoint,
])


 return (
  <div
    style={{
      minHeight: '100dvh',
      background: T.bg,
      color: T.text,
      fontFamily: FB,
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <link
      href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap"
      rel="stylesheet"
    />

    {/* Header */}
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

      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          color: T.muted,
        }}
      >
        {isFinishCheckpoint
          ? 'Tap finishers as they cross.'
          : 'Tap racers as they pass.'}
      </div>
    </div>

    {/* Main content */}
    <div
      style={{
        flex: 1,
        width: '100%',
        maxWidth: 760,
        margin: '0 auto',
        display: 'grid',
        gap: 16,
        padding: 16,
      }}
    >
      {/* Optional pending assignment banner */}
      {pending.length > 0 && (
        <div
          style={{
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
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}
          >
            {isFinishCheckpoint
              ? `${pending.length} unassigned ${pending.length === 1 ? 'finisher' : 'finishers'}`
              : `${pending.length} unassigned ${pending.length === 1 ? 'tap' : 'taps'}`}
          </div>

          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              color: T.muted,
            }}
          >
            Assignment happens on the assigner screen.
          </div>
        </div>
      )}

      {/* Capture button */}
      <div
        style={{
          display: 'grid',
          gap: 10,
        }}
      >
        <button
          onPointerDown={e => {
            e.preventDefault()
            if (canCapture) captureLap()
          }}
          disabled={!canCapture || savingLap}
          style={{
            width: '100%',
            minHeight: 140,
            borderRadius: 18,
            border: 'none',
            background: !canCapture
              ? T.dim
              : flash
                ? T.flash
                : T.accent,
            color: T.buttonText,
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: 2,
            cursor: canCapture && !savingLap ? 'pointer' : 'not-allowed',
            fontFamily: F,
            textTransform: 'uppercase',
            transform: flash ? 'scale(0.97)' : 'scale(1)',
            transition: 'background 0.08s, transform 0.08s',
            touchAction: 'manipulation',
            opacity: canCapture && !savingLap ? 1 : 0.6,
          }}
        >
          {savingLap
            ? 'Saving…'
            : event?.status === 'finished'
              ? 'Ended'
              : !canCapture
                ? 'Waiting'
                : captureLabel}
        </button>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={undoLastCheckpoint}
            disabled={!undoTarget}
            style={{
              flex: 1,
              minWidth: 140,
              height: 42,
              borderRadius: 10,
              border: `1px solid ${T.warningBorder}`,
              background: 'transparent',
              color: undoTarget ? T.warning : T.dim,
              fontFamily: F,
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
              cursor: undoTarget ? 'pointer' : 'not-allowed',
              opacity: undoTarget ? 1 : 0.5,
            }}
          >
            Undo Last
          </button>

          <button
            onClick={voidLastPending}
            disabled={!pending.length}
            style={{
              flex: 1,
              minWidth: 140,
              height: 42,
              borderRadius: 10,
              border: `1px solid ${T.dangerBorder}`,
              background: 'transparent',
              color: pending.length ? T.danger : T.dim,
              fontFamily: F,
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
              cursor: pending.length ? 'pointer' : 'not-allowed',
              opacity: pending.length ? 1 : 0.5,
            }}
          >
            {isFinishCheckpoint ? 'Void Last Finisher' : 'Void Last Tap'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}
      >
        <div
          style={{
            borderRadius: 16,
            border: `1px solid ${T.border2}`,
            background: T.panel,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: 150,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: T.muted2,
              textTransform: 'uppercase',
              letterSpacing: 2,
              fontFamily: F,
              fontWeight: 700,
            }}
          >
            {checkpointSummaryLabel}
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
              {recordedCountLabel}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div
              style={{
                fontSize: 10,
                color: T.muted2,
                textTransform: 'uppercase',
                letterSpacing: 1.4,
                fontFamily: F,
                fontWeight: 700,
              }}
            >
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
            minHeight: 150,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: T.muted2,
              textTransform: 'uppercase',
              letterSpacing: 2,
              fontFamily: F,
              fontWeight: 700,
            }}
          >
            {isFinishCheckpoint ? 'Last Finishers' : 'Last Captures'}
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
                      <span
                        style={{
                          fontSize: 10,
                          color: idx === 0 ? T.successBright : T.muted2,
                          textTransform: 'uppercase',
                          letterSpacing: 1.2,
                          fontFamily: F,
                          fontWeight: 800,
                        }}
                      >
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

                    <div
                      style={{
                        fontSize: 12,
                        color: T.textStrong,
                        fontWeight: 700,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isFinishCheckpoint
                        ? `Place ${activePlaceByLapId[l.id] ?? '—'} · Bib ${bib} · ${name}`
                        : `Bib ${bib} · ${name}`}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Last action / undo feedback */}
      {lastAction && lastActionTone && (
        <div
          style={{
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

          <div style={{ marginTop: 5, fontSize: 12, color: T.muted }}>
            {lastAction.detail}
          </div>
        </div>
      )}

      {/* Recent list */}
      <div
        style={{
          borderRadius: 16,
          border: `1px solid ${T.border2}`,
          background: T.panel,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '10px 14px',
            borderBottom: `1px solid ${T.border}`,
            fontSize: 10,
            color: T.muted2,
            textTransform: 'uppercase',
            letterSpacing: 2,
            fontFamily: F,
            fontWeight: 800,
          }}
        >
          Recent Passes
        </div>

        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {[...laps]
            .filter(l => l.status !== 'void')
            .sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))
            .map(l => {
              const bib = l.bib_number || '—'
              const name = l.bib_number ? getEntryDisplayName(l.bib_number) : 'Pending tap'

              return (
                <div
                  key={l.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '90px 70px 1fr 96px',
                    padding: '8px 14px',
                    borderBottom: `1px solid ${T.faint}`,
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: T.textStrong,
                      fontVariantNumeric: 'tabular-nums',
                      fontFamily: F,
                    }}
                  >
                    {fmt(l.elapsed_ms, true)}
                  </span>

                  <span
                    style={{
                      color: l.bib_number ? T.warning : T.dim,
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: F,
                    }}
                  >
                    {bib}
                  </span>

                  <span
                    style={{
                      fontSize: 13,
                      color: name ? T.text : T.dim,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {name}
                  </span>

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
                </div>
              )
            })}
        </div>
      </div>

      {message && (
        <div style={{ textAlign: 'center', fontSize: 11, color: T.warning }}>
          {message}
        </div>
      )}
    </div>
  </div>
)
}