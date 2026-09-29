import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getRaceElapsedMs } from '../lib/raceClock'
import { resolveCheckpointAccess } from '../lib/resolveCheckpointAccess'
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
    accent: '#3b82f6',
    accent2: '#2563eb',
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
    info: '#38bdf8',
    infoBg: 'rgba(56,189,248,0.10)',
    infoBorder: 'rgba(56,189,248,0.22)',
    pendingBg: 'rgba(245,158,11,0.06)',
    pendingNext: 'rgba(245,158,11,0.11)',
    selectedBg: 'rgba(59,130,246,0.10)',
    selectedBorder: 'rgba(59,130,246,0.28)',
    zebra: '#0b1118',
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
    accent: '#2563eb',
    accent2: '#1d4ed8',
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
    info: '#0284c7',
    infoBg: 'rgba(2,132,199,0.08)',
    infoBorder: 'rgba(2,132,199,0.20)',
    pendingBg: 'rgba(217,119,6,0.05)',
    pendingNext: 'rgba(217,119,6,0.10)',
    selectedBg: 'rgba(37,99,235,0.08)',
    selectedBorder: 'rgba(37,99,235,0.22)',
    zebra: '#f8fafc',
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
      ? `$${hours}:$${String(minutes).padStart(2, '0')}:$${String(seconds).padStart(2, '0')}.$${String(centi).padStart(2, '0')}`
      : `$${hours}:$${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return includeCenti
    ? `$${String(minutes).padStart(2, '0')}:$${String(seconds).padStart(2, '0')}.${String(centi).padStart(2, '0')}`
    : `$${String(minutes).padStart(2, '0')}:$${String(seconds).padStart(2, '0')}`
}

function getThemeStorageKey(scopeKey) {
  return `checkpoint_assigner_theme:${scopeKey}`
}

function getPendingLocalStorageKey(eventId, checkpointId) {
  return `checkpoint_assigner_pending:$${eventId}:$${checkpointId}`
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

export default function StaffAssignerPage() {
  const params = useParams()
  const directEventId = params.id
  const directCheckpointId = params.checkpointId
  const accessCode = params.accessCode

  const [resolved, setResolved] = useState(null)
  const [resolving, setResolving] = useState(true)
  const [resolveError, setResolveError] = useState('')

  const [event, setEvent] = useState(null)
  const [checkpoint, setCheckpoint] = useState(null)
  const [entries, setEntries] = useState([])
  const [entriesByBib, setEntriesByBib] = useState({})
  const [laps, setLaps] = useState([])
  const [raceStart, setRaceStart] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  const [theme, setTheme] = useState('light')
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const [bibInput, setBibInput] = useState('')
  const [selectedLapId, setSelectedLapId] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [lastAction, setLastAction] = useState(null)

  const tickRef = useRef(null)
  const retryRef = useRef(null)
  const inputRef = useRef(null)
  const messageTimeoutRef = useRef(null)

  const T = THEMES[theme]

  const eventId = resolved?.eventId || null
  const checkpointId = resolved?.checkpointId || null
  const scopeKey = accessCode || checkpointId || 'default'

  const checkpointName = String(checkpoint?.name || '').trim().toLowerCase()
  const isFinishCheckpoint =
    checkpointName === 'finish' ||
    checkpointName.includes('finish') ||
    checkpointName.includes('finish line')

  const statusPill = useCallback((tone = 'default') => {
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
  }, [T])

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

  const setTransientMessage = useCallback((text, ms = 1500) => {
    setMessage(text)
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current)
    if (ms) {
      messageTimeoutRef.current = window.setTimeout(() => {
        setMessage('')
        messageTimeoutRef.current = null
      }, ms)
    }
  }, [])

  const pushLastAction = useCallback(payload => {
    setLastAction({ at: Date.now(), ...payload })
  }, [])

  const getEntryDisplayName = useCallback(entry => {
    if (!entry) return 'Unknown bib'
    return (
      `$${entry.first_name ?? ''}$${entry.last_name ? ` ${entry.last_name}` : ''}`.trim() ||
      entry.team ||
      `Bib ${entry.bib_number}`
    )
  }, [])

  const getLastActionTone = useCallback(() => {
    if (!lastAction) return null
    if (lastAction.status === 'failed') return { tone: 'danger', icon: '⚠', title: 'Action Failed' }
    if (lastAction.status === 'local') return { tone: 'warning', icon: '☁', title: 'Saved Locally' }
    if (lastAction.type === 'void') return { tone: 'warning', icon: '⛔', title: 'Voided' }
    if (lastAction.type === 'unknown') return { tone: 'warning', icon: '?', title: 'Marked Unknown' }
    if (lastAction.type === 'assign') return { tone: 'success', icon: '✓', title: 'Assigned' }
    return { tone: 'info', icon: '•', title: 'Last Action' }
  }, [lastAction])

  useEffect(() => {
    let active = true

    async function run() {
      setResolving(true)
      setResolveError('')

      try {
        const next = await resolveCheckpointAccess({
          eventId: directEventId,
          checkpointId: directCheckpointId,
          accessCode,
        })

        if (!active) return
        setResolved(next)
      } catch (err) {
        if (!active) return
        setResolveError(err.message || 'Could not resolve checkpoint access')
      } finally {
        if (active) setResolving(false)
      }
    }

    run()

    return () => {
      active = false
    }
  }, [directEventId, directCheckpointId, accessCode])

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const savedTheme = localStorage.getItem(getThemeStorageKey(scopeKey))
    if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme)
  }, [scopeKey])

  useEffect(() => {
    localStorage.setItem(getThemeStorageKey(scopeKey), theme)
  }, [scopeKey, theme])

  useEffect(() => {
    if (!eventId || !checkpointId) return

    setEvent(null)
    setCheckpoint(null)
    setEntries([])
    setEntriesByBib({})
    setLaps([])
    setRaceStart(null)
    setElapsed(0)
    setBibInput('')
    setSelectedLapId(null)
    setShowAll(false)
    setLastAction(null)

    async function load() {
      const [{ data: eventData }, { data: checkpointData }, { data: entryData }, { data: lapData }] =
        await Promise.all([
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

      const list = entryData || []
      const byBib = {}
      list.forEach(entry => {
        byBib[String(entry.bib_number)] = entry
      })

      setEntries(list)
      setEntriesByBib(byBib)
      setLaps(lapData || [])
    }

    load()

    const ch = supabase
      .channel(`checkpoint-assigner:$${eventId}:$${checkpointId}`)
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
            const next = exists ? prev.map(x => (x.id === row.id ? row : x)) : [...prev, row]
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
      tickRef.current = setInterval(updateElapsed, 100)
    }

    return () => clearInterval(tickRef.current)
  }, [event?.race_started_at, event?.race_finished_at, event?.status])

  useEffect(() => {
    if (!eventId || !checkpointId) return

    async function retryUnsynced() {
      const localRaceEvent = loadRaceEventLocal(eventId)

      if (localRaceEvent?.type === 'start_race') {
        const { data: syncedEvent, error } = await supabase
          .from('race_events')
          .update({
            status: 'active',
            race_started_at: localRaceEvent.race_started_at,
            race_finished_at: null,
          })
          .eq('id', eventId)
          .select()
          .single()

        if (!error && syncedEvent) {
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
        if (row.type === 'update') {
          const { target_id, payload } = row
          const { error } = await supabase.from('lap_events').update(payload).eq('id', target_id)
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

  const pending = useMemo(() => {
    return laps
      .filter(l => l.status !== 'void' && !l.bib_number)
      .sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at))
  }, [laps])

  const selectedLap = useMemo(() => {
    if (selectedLapId) {
      const found = pending.find(l => l.id === selectedLapId) || laps.find(l => l.id === selectedLapId)
      if (found && found.status !== 'void') return found
    }
    return pending[0] || null
  }, [selectedLapId, pending, laps])

  const visibleRows = useMemo(() => {
    const base = [...laps]
      .filter(l => l.status !== 'void')
      .sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))

    return showAll ? base : base.slice(0, 20)
  }, [laps, showAll])

  const pendingCount = pending.length

  const currentSaveState = useMemo(() => {
    const local = eventId && checkpointId ? loadPendingLocal(eventId, checkpointId) : []
    if (syncing) return { label: 'Syncing…', tone: 'info' }
    if (local.length > 0) return { label: 'Saved locally', tone: 'warning' }
    if (pendingCount > 0) return { label: 'Assignment needed', tone: 'warning' }
    return { label: 'Ready', tone: 'success' }
  }, [eventId, checkpointId, syncing, pendingCount])

  const lastActionTone = getLastActionTone()

  const normalizeBib = value => String(value || '').trim()

  const focusBibInput = useCallback(() => {
    window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select?.()
    }, 0)
  }, [])

  const queueOfflineUpdate = useCallback((targetId, payload) => {
    const local = loadPendingLocal(eventId, checkpointId)
    local.push({ type: 'update', target_id: targetId, payload })
    savePendingLocal(eventId, checkpointId, local)
  }, [eventId, checkpointId])

  const applyOptimisticLapUpdate = useCallback((lapId, payload) => {
    setLaps(prev => prev.map(l => (l.id === lapId ? { ...l, ...payload } : l)))
  }, [])

  const assignLap = useCallback(async (lap, bibValue) => {
    const bib = normalizeBib(bibValue)
    if (!lap || !bib) return

    const entry = entriesByBib[bib]
    if (!entry) {
      setTransientMessage(`Bib ${bib} not found`, 1800)
      pushLastAction({
        type: 'assign',
        status: 'failed',
        lapId: lap.id,
        bib_number: bib,
        name: `Bib ${bib}`,
        detail: 'Bib not found',
        elapsed_ms: lap.elapsed_ms,
      })
      focusBibInput()
      return
    }

    const payload = {
      bib_number: bib,
      entry_id: entry.id,
      assigned_at: new Date().toISOString(),
      status: 'assigned',
    }

    applyOptimisticLapUpdate(lap.id, payload)

    const { error } = await supabase.from('lap_events').update(payload).eq('id', lap.id)

    if (error) {
      queueOfflineUpdate(lap.id, payload)

      pushLastAction({
        type: 'assign',
        status: 'local',
        lapId: lap.id,
        bib_number: bib,
        name: getEntryDisplayName(entry),
        detail: 'Assignment saved locally — waiting to sync',
        elapsed_ms: lap.elapsed_ms,
      })

      setTransientMessage('Assignment saved locally, waiting to sync', 1800)
    } else {
      pushLastAction({
        type: 'assign',
        status: 'saved',
        lapId: lap.id,
        bib_number: bib,
        name: getEntryDisplayName(entry),
        detail: isFinishCheckpoint ? 'Finisher assigned' : 'Lap assigned',
        elapsed_ms: lap.elapsed_ms,
      })

      setTransientMessage(isFinishCheckpoint ? 'Finisher assigned' : 'Lap assigned', 1200)
    }

    setBibInput('')
    setSelectedLapId(null)
    focusBibInput()
  }, [
    entriesByBib,
    applyOptimisticLapUpdate,
    queueOfflineUpdate,
    getEntryDisplayName,
    setTransientMessage,
    pushLastAction,
    focusBibInput,
    isFinishCheckpoint,
  ])

  const assignSelected = useCallback(async () => {
    if (!selectedLap) {
      setTransientMessage('No pending tap selected', 1400)
      return
    }
    await assignLap(selectedLap, bibInput)
  }, [selectedLap, bibInput, assignLap, setTransientMessage])

  const markUnknown = useCallback(async () => {
    if (!selectedLap) return

    const payload = {
      bib_number: 'UNKNOWN',
      entry_id: null,
      assigned_at: new Date().toISOString(),
      status: 'assigned',
      is_corrected: true,
      correction_note: 'Marked UNKNOWN from assigner',
    }

    applyOptimisticLapUpdate(selectedLap.id, payload)

    const { error } = await supabase.from('lap_events').update(payload).eq('id', selectedLap.id)

    if (error) {
      queueOfflineUpdate(selectedLap.id, payload)

      pushLastAction({
        type: 'unknown',
        status: 'local',
        lapId: selectedLap.id,
        bib_number: 'UNKNOWN',
        name: 'UNKNOWN',
        detail: 'Marked unknown locally — waiting to sync',
        elapsed_ms: selectedLap.elapsed_ms,
      })

      setTransientMessage('Marked UNKNOWN locally, waiting to sync', 1800)
    } else {
      pushLastAction({
        type: 'unknown',
        status: 'saved',
        lapId: selectedLap.id,
        bib_number: 'UNKNOWN',
        name: 'UNKNOWN',
        detail: 'Marked unknown',
        elapsed_ms: selectedLap.elapsed_ms,
      })

      setTransientMessage('Marked UNKNOWN', 1200)
    }

    setSelectedLapId(null)
    setBibInput('')
    focusBibInput()
  }, [
    selectedLap,
    applyOptimisticLapUpdate,
    queueOfflineUpdate,
    pushLastAction,
    setTransientMessage,
    focusBibInput,
  ])

  const markNoBib = useCallback(async () => {
    if (!selectedLap) return

    const payload = {
      bib_number: 'NO BIB',
      entry_id: null,
      assigned_at: new Date().toISOString(),
      status: 'assigned',
      is_corrected: true,
      correction_note: 'Marked NO BIB from assigner',
    }

    applyOptimisticLapUpdate(selectedLap.id, payload)

    const { error } = await supabase.from('lap_events').update(payload).eq('id', selectedLap.id)

    if (error) {
      queueOfflineUpdate(selectedLap.id, payload)

      pushLastAction({
        type: 'unknown',
        status: 'local',
        lapId: selectedLap.id,
        bib_number: 'NO BIB',
        name: 'NO BIB',
        detail: 'Marked no bib locally — waiting to sync',
        elapsed_ms: selectedLap.elapsed_ms,
      })

      setTransientMessage('Marked NO BIB locally, waiting to sync', 1800)
    } else {
      pushLastAction({
        type: 'unknown',
        status: 'saved',
        lapId: selectedLap.id,
        bib_number: 'NO BIB',
        name: 'NO BIB',
        detail: 'Marked no bib',
        elapsed_ms: selectedLap.elapsed_ms,
      })

      setTransientMessage('Marked NO BIB', 1200)
    }

    setSelectedLapId(null)
    setBibInput('')
    focusBibInput()
  }, [
    selectedLap,
    applyOptimisticLapUpdate,
    queueOfflineUpdate,
    pushLastAction,
    setTransientMessage,
    focusBibInput,
  ])

  const voidLap = useCallback(async lap => {
    if (!lap) return

    const payload = {
      status: 'void',
      is_corrected: true,
      correction_note: 'Voided from assigner page',
    }

    applyOptimisticLapUpdate(lap.id, payload)

    const { error } = await supabase.from('lap_events').update(payload).eq('id', lap.id)

    if (error) {
      queueOfflineUpdate(lap.id, payload)

      pushLastAction({
        type: 'void',
        status: 'local',
        lapId: lap.id,
        bib_number: lap.bib_number || null,
        name: lap.bib_number || 'Pending tap',
        detail: 'Void saved locally — waiting to sync',
        elapsed_ms: lap.elapsed_ms,
      })

      setTransientMessage('Void saved locally, waiting to sync', 1600)
    } else {
      pushLastAction({
        type: 'void',
        status: 'saved',
        lapId: lap.id,
        bib_number: lap.bib_number || null,
        name: lap.bib_number || 'Pending tap',
        detail: 'Lap voided',
        elapsed_ms: lap.elapsed_ms,
      })

      setTransientMessage('Lap voided', 1200)
    }

    if (selectedLapId === lap.id) {
      setSelectedLapId(null)
      setBibInput('')
      focusBibInput()
    }
  }, [
    applyOptimisticLapUpdate,
    queueOfflineUpdate,
    pushLastAction,
    setTransientMessage,
    selectedLapId,
    focusBibInput,
  ])

  useEffect(() => {
    focusBibInput()
  }, [focusBibInput])

  useEffect(() => {
    const handler = e => {
      if (e.key === 'Enter') {
        if (document.activeElement === inputRef.current) {
          e.preventDefault()
          assignSelected()
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [assignSelected])

  const bibPreview = useMemo(() => {
    const bib = normalizeBib(bibInput)
    if (!bib) return null
    return entriesByBib[bib] || null
  }, [bibInput, entriesByBib])

  if (resolving) {
    return <div style={{ padding: 24, fontFamily: FB }}>Loading checkpoint...</div>
  }

  if (resolveError) {
    return <div style={{ padding: 24, fontFamily: FB, color: '#dc2626' }}>{resolveError}</div>
  }

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
          {checkpoint?.name || 'Checkpoint'} Assigner
        </div>

        <div
          style={{
            marginTop: 8,
            fontSize: 'clamp(34px, 8vw, 56px)',
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

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
          <button style={themeBtn(theme === 'light')} onClick={() => setTheme('light')}>
            ☀ Light
          </button>
          <button style={themeBtn(theme === 'dark')} onClick={() => setTheme('dark')}>
            🌙 Dark
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 11, color: T.muted }}>
          Assign bibs to pending {isFinishCheckpoint ? 'finishers' : 'passes'}.
        </div>
      </div>

      <div
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 980,
          margin: '0 auto',
          display: 'grid',
          gap: 16,
          padding: 16,
        }}
      >
        <div
          style={{
            borderRadius: 16,
            border: `1px solid ${T.warningBorder}`,
            background: pendingCount > 0 ? T.pendingNext : T.panel,
            padding: '14px 16px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: pendingCount > 0 ? T.warning : T.muted2,
              fontFamily: F,
              fontWeight: 900,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}
          >
            {pendingCount > 0
              ? `Next pending ${isFinishCheckpoint ? 'finisher' : 'pass'}`
              : `No pending ${isFinishCheckpoint ? 'finishers' : 'passes'}`}
          </div>

          {selectedLap ? (
            <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
              <div
                style={{
                  fontSize: 30,
                  color: T.textStrong,
                  fontFamily: F,
                  fontWeight: 900,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmt(selectedLap.elapsed_ms, true)}
              </div>

              <div style={{ fontSize: 13, color: T.muted }}>
                Captured {new Date(selectedLap.captured_at).toLocaleTimeString()}
              </div>

              <div style={{ fontSize: 14, color: T.textStrong, fontWeight: 700 }}>
                {selectedLap.bib_number ? `Assigned: ${selectedLap.bib_number}` : 'Awaiting bib assignment'}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 14, color: T.muted }}>
              All current records are assigned.
            </div>
          )}
        </div>

        <div
          style={{
            borderRadius: 16,
            border: `1px solid ${T.border2}`,
            background: T.panel,
            padding: 16,
            display: 'grid',
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: T.muted2,
              textTransform: 'uppercase',
              letterSpacing: 2,
              fontFamily: F,
              fontWeight: 800,
            }}
          >
            Assign Bib
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
            <input
              ref={inputRef}
              value={bibInput}
              onChange={e => setBibInput(e.target.value)}
              placeholder="Enter bib number"
              style={{
                height: 52,
                borderRadius: 12,
                border: `1px solid ${T.inputBorder}`,
                background: T.inputBg,
                color: T.textStrong,
                padding: '0 14px',
                fontSize: 22,
                fontWeight: 800,
                fontFamily: F,
                letterSpacing: 1,
                outline: 'none',
              }}
            />

            <button
              onClick={assignSelected}
              disabled={!selectedLap || !String(bibInput).trim()}
              style={{
                minWidth: 120,
                height: 52,
                borderRadius: 12,
                border: 'none',
                background: !selectedLap || !String(bibInput).trim() ? T.dim : T.accent,
                color: T.buttonText,
                fontFamily: F,
                fontWeight: 900,
                fontSize: 14,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                cursor: !selectedLap || !String(bibInput).trim() ? 'not-allowed' : 'pointer',
              }}
            >
              Assign
            </button>
          </div>

          {bibInput.trim() && (
            <div
              style={{
                borderRadius: 12,
                padding: '10px 12px',
                border: `1px solid ${bibPreview ? T.successBorder : T.warningBorder}`,
                background: bibPreview ? T.successBg : T.warningBg,
              }}
            >
              {bibPreview ? (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: T.successBright,
                      fontFamily: F,
                      fontWeight: 800,
                      letterSpacing: 1.2,
                      textTransform: 'uppercase',
                    }}
                  >
                    Bib Found
                  </div>
                  <div style={{ marginTop: 4, fontSize: 14, color: T.textStrong, fontWeight: 700 }}>
                    Bib {bibPreview.bib_number} · {getEntryDisplayName(bibPreview)}
                  </div>
                  {bibPreview.team && (
                    <div style={{ marginTop: 2, fontSize: 12, color: T.muted }}>
                      {bibPreview.team}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: T.warning,
                      fontFamily: F,
                      fontWeight: 800,
                      letterSpacing: 1.2,
                      textTransform: 'uppercase',
                    }}
                  >
                    Bib Not Found
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: T.textStrong }}>
                    No entry found for bib {bibInput.trim()}
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={markUnknown}
              disabled={!selectedLap}
              style={{
                minWidth: 120,
                height: 42,
                borderRadius: 10,
                border: `1px solid ${T.warningBorder}`,
                background: 'transparent',
                color: selectedLap ? T.warning : T.dim,
                fontFamily: F,
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: 1.1,
                textTransform: 'uppercase',
                cursor: selectedLap ? 'pointer' : 'not-allowed',
                opacity: selectedLap ? 1 : 0.5,
              }}
            >
              UNKNOWN
            </button>

            <button
              onClick={markNoBib}
              disabled={!selectedLap}
              style={{
                minWidth: 120,
                height: 42,
                borderRadius: 10,
                border: `1px solid ${T.warningBorder}`,
                background: 'transparent',
                color: selectedLap ? T.warning : T.dim,
                fontFamily: F,
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: 1.1,
                textTransform: 'uppercase',
                cursor: selectedLap ? 'pointer' : 'not-allowed',
                opacity: selectedLap ? 1 : 0.5,
              }}
            >
              NO BIB
            </button>

            <button
              onClick={() => selectedLap && voidLap(selectedLap)}
              disabled={!selectedLap}
              style={{
                minWidth: 120,
                height: 42,
                borderRadius: 10,
                border: `1px solid ${T.dangerBorder}`,
                background: 'transparent',
                color: selectedLap ? T.danger : T.dim,
                fontFamily: F,
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: 1.1,
                textTransform: 'uppercase',
                cursor: selectedLap ? 'pointer' : 'not-allowed',
                opacity: selectedLap ? 1 : 0.5,
              }}
            >
              Void Selected
            </button>
          </div>
        </div>

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
              {lastAction.bib_number ? ` · ${lastAction.bib_number}` : ''}
            </div>

            <div style={{ marginTop: 5, fontSize: 12, color: T.muted }}>
              {lastAction.detail}
            </div>
          </div>
        )}

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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: T.muted2,
                textTransform: 'uppercase',
                letterSpacing: 2,
                fontFamily: F,
                fontWeight: 800,
              }}
            >
              Pending + Recent
            </div>

            <button
              onClick={() => setShowAll(v => !v)}
              style={{
                height: 30,
                padding: '0 10px',
                borderRadius: 8,
                border: `1px solid ${T.border2}`,
                background: 'transparent',
                color: T.textStrong,
                fontFamily: F,
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: 1,
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              {showAll ? 'Show Recent' : 'Show All'}
            </button>
          </div>

          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {visibleRows.map((lap, idx) => {
              const isSelected = selectedLap?.id === lap.id
              const isPending = lap.status !== 'void' && !lap.bib_number
              const entry = lap.bib_number ? entriesByBib[String(lap.bib_number)] : null
              const name = entry
                ? getEntryDisplayName(entry)
                : lap.bib_number
                  ? lap.bib_number
                  : 'Pending tap'

              return (
                <div
                  key={lap.id}
                  onClick={() => {
                    setSelectedLapId(lap.id)
                    focusBibInput()
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 90px 1fr 100px',
                    gap: 8,
                    alignItems: 'center',
                    padding: '10px 14px',
                    borderBottom: `1px solid ${T.faint}`,
                    background: isSelected
                      ? T.selectedBg
                      : isPending
                        ? idx % 2 === 0
                          ? T.pendingBg
                          : T.pendingNext
                        : idx % 2 === 0
                          ? 'transparent'
                          : T.zebra,
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: T.textStrong,
                      fontFamily: F,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmt(lap.elapsed_ms, true)}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: isPending ? T.warning : T.textStrong,
                      fontFamily: F,
                      fontWeight: 800,
                    }}
                  >
                    {lap.bib_number || 'PENDING'}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: T.textStrong,
                        fontWeight: 700,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {name}
                    </div>

                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 11,
                        color: T.muted,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {lap.captured_at ? new Date(lap.captured_at).toLocaleTimeString() : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {isPending ? (
                      <span
                        style={{
                          ...statusPill('warning'),
                          borderRadius: 999,
                          padding: '4px 8px',
                          fontSize: 10,
                          fontFamily: F,
                          fontWeight: 800,
                          letterSpacing: 1,
                          textTransform: 'uppercase',
                        }}
                      >
                        Pending
                      </span>
                    ) : (
                      <span
                        style={{
                          ...statusPill('success'),
                          borderRadius: 999,
                          padding: '4px 8px',
                          fontSize: 10,
                          fontFamily: F,
                          fontWeight: 800,
                          letterSpacing: 1,
                          textTransform: 'uppercase',
                        }}
                      >
                        Assigned
                      </span>
                    )}
                  </div>
                </div>
              )
            })}

            {visibleRows.length === 0 && (
              <div style={{ padding: 18, textAlign: 'center', color: T.muted }}>
                No captured records yet.
              </div>
            )}
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