import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../contexts/ThemeContext'
import { getRaceCheckpointsPath, getRaceSetupPath } from '../lib/routes'
import { getRaceElapsedMs, formatRaceClock } from '../lib/raceClock' // adjust if needed

const F = `'Barlow Condensed', sans-serif`
const FB = `'Barlow', sans-serif`

function formatElapsed(ms) {
  return formatRaceClock(ms || 0)
}

function buildEntryMap(entries) {
  const byBib = {}

  for (const entry of entries || []) {
    const bib = String(entry?.bib_number || '').trim()
    if (!bib) continue
    byBib[bib] = entry
  }

  return byBib
}

function getEntryDisplayName(entry) {
  if (!entry) return ''
  return [entry.first_name, entry.last_name].filter(Boolean).join(' ').trim()
}

function getVisibleCheckpointRows(lapEvents, entryMap) {
  const active = (lapEvents || [])
    .filter(row => row.status !== 'void')
    .slice()
    .sort((a, b) => {
      const aSeq = Number(a.sequence_number) || 0
      const bSeq = Number(b.sequence_number) || 0
      if (aSeq !== bSeq) return aSeq - bSeq

      return new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
    })

  const withPlaces = active.map((row, index) => {
    const bib = String(row.bib_number || '').trim()
    const matched = bib ? entryMap[bib] : null

    return {
      ...row,
      visiblePlace: index + 1,
      athleteName: matched ? getEntryDisplayName(matched) : '',
    }
  })

  return withPlaces.slice().reverse()
}

function getNextSequenceNumber(lapEvents) {
  const maxSeq = Math.max(
    0,
    ...(lapEvents || [])
      .filter(row => row.status !== 'void')
      .map(row => Number(row.sequence_number) || 0)
  )

  return maxSeq + 1
}

function getToggleKey(checkpointId, key) {
  return `checkpoint-timer:${checkpointId}:${key}`
}

function loadToggle(checkpointId, key, fallback = true) {
  try {
    const value = localStorage.getItem(getToggleKey(checkpointId, key))
    if (value == null) return fallback
    return value === 'true'
  } catch {
    return fallback
  }
}

function saveToggle(checkpointId, key, value) {
  try {
    localStorage.setItem(getToggleKey(checkpointId, key), String(value))
  } catch {
    // ignore
  }
}

export default function CheckpointTimerPage() {
  const { eventId, checkpointId } = useParams()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const S = useMemo(() => getStyles(theme), [theme])

  const [event, setEvent] = useState(null)
  const [checkpoint, setCheckpoint] = useState(null)
  const [entries, setEntries] = useState([])
  const [lapEvents, setLapEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [voidingId, setVoidingId] = useState(null)
  const [error, setError] = useState('')
  const [flashOn, setFlashOn] = useState(false)
  const [nowMs, setNowMs] = useState(Date.now())

  const [soundEnabled, setSoundEnabled] = useState(() => loadToggle(checkpointId, 'sound', true))
  const [hapticEnabled, setHapticEnabled] = useState(() => loadToggle(checkpointId, 'haptic', true))
  const [flashEnabled, setFlashEnabled] = useState(() => loadToggle(checkpointId, 'flash', true))

  const audioRef = useRef(null)

  useEffect(() => {
    setSoundEnabled(loadToggle(checkpointId, 'sound', true))
    setHapticEnabled(loadToggle(checkpointId, 'haptic', true))
    setFlashEnabled(loadToggle(checkpointId, 'flash', true))
  }, [checkpointId])

  useEffect(() => {
    saveToggle(checkpointId, 'sound', soundEnabled)
  }, [checkpointId, soundEnabled])

  useEffect(() => {
    saveToggle(checkpointId, 'haptic', hapticEnabled)
  }, [checkpointId, hapticEnabled])

  useEffect(() => {
    saveToggle(checkpointId, 'flash', flashEnabled)
  }, [checkpointId, flashEnabled])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  const loadLapEvents = useCallback(async () => {
    if (!eventId || !checkpointId) return

    const { data, error } = await supabase
      .from('lap_events')
      .select('*')
      .eq('event_id', eventId)
      .eq('checkpoint_id', checkpointId)
      .neq('status', 'void')
      .order('sequence_number', { ascending: false })
      .order('captured_at', { ascending: false })

    if (error) {
      setError(error.message || 'Could not load checkpoint passes.')
      return
    }

    setLapEvents(data || [])
  }, [eventId, checkpointId])

  const loadPage = useCallback(async () => {
    if (!eventId || !checkpointId) return

    setLoading(true)
    setError('')

    const [
      { data: eventData, error: eventError },
      { data: checkpointData, error: checkpointError },
      { data: entriesData, error: entriesError },
      { data: lapsData, error: lapsError },
    ] = await Promise.all([
      supabase.from('race_events').select('*').eq('id', eventId).single(),
      supabase.from('race_checkpoints').select('*').eq('id', checkpointId).single(),
      supabase.from('event_entries').select('id, bib_number, first_name, last_name').eq('event_id', eventId),
      supabase
        .from('lap_events')
        .select('*')
        .eq('event_id', eventId)
        .eq('checkpoint_id', checkpointId)
        .neq('status', 'void')
        .order('sequence_number', { ascending: false })
        .order('captured_at', { ascending: false }),
    ])

    if (eventError || checkpointError || entriesError || lapsError) {
      setError(
        eventError?.message ||
        checkpointError?.message ||
        entriesError?.message ||
        lapsError?.message ||
        'Failed to load checkpoint timer.'
      )
      setLoading(false)
      return
    }

    setEvent(eventData || null)
    setCheckpoint(checkpointData || null)
    setEntries(entriesData || [])
    setLapEvents(lapsData || [])
    setLoading(false)
  }, [eventId, checkpointId])

  useEffect(() => {
    loadPage()
  }, [loadPage])

  useEffect(() => {
    if (!checkpointId) return

    const channel = supabase
      .channel(`checkpoint-timer:${checkpointId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lap_events',
          filter: `checkpoint_id=eq.${checkpointId}`,
        },
        () => {
          loadLapEvents()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [checkpointId, loadLapEvents])

  const entryMap = useMemo(() => buildEntryMap(entries), [entries])

  const rows = useMemo(() => getVisibleCheckpointRows(lapEvents, entryMap), [lapEvents, entryMap])

  const elapsedMs = useMemo(() => {
    return getRaceElapsedMs(event, nowMs)
  }, [event, nowMs])

  const lastRow = rows[0] || null
  const canRecord = event?.status === 'active' && !!event?.race_started_at && !saving
  const canUndoLast = !saving && !!lastRow

  const triggerFeedback = () => {
    if (flashEnabled) {
      setFlashOn(true)
      window.setTimeout(() => setFlashOn(false), 140)
    }

    if (hapticEnabled && navigator.vibrate) {
      navigator.vibrate(35)
    }

    if (soundEnabled) {
      try {
        if (audioRef.current) {
          audioRef.current.currentTime = 0
          audioRef.current.play().catch(() => {})
        }
      } catch {
        // ignore
      }
    }
  }

  const recordLap = async () => {
    if (!event?.race_started_at || event?.status !== 'active' || saving) return

    setSaving(true)
    setError('')

    const nextSequence = getNextSequenceNumber(lapEvents)
    const elapsedMsValue = getRaceElapsedMs(event, Date.now())

    const { data, error } = await supabase
      .from('lap_events')
      .insert({
        event_id: eventId,
        checkpoint_id: checkpointId,
        user_id: event?.user_id || null,
        entry_id: null,
        bib_number: null,
        elapsed_ms: elapsedMsValue,
        captured_at: new Date().toISOString(),
        assigned_at: null,
        status: 'pending',
        sequence_number: nextSequence,
        source: 'manual',
        device_id: null,
      })
      .select()
      .single()

    setSaving(false)

    if (error || !data) {
      setError(error?.message || 'Could not record lap.')
      return
    }

    triggerFeedback()
    setLapEvents(prev => [data, ...prev])
  }

  const voidLap = async (lapId, note = 'Voided from timer page') => {
    if (!lapId) return

    setVoidingId(lapId)
    setError('')

    const { error } = await supabase
      .from('lap_events')
      .update({
        status: 'void',
        is_corrected: true,
        correction_note: note,
      })
      .eq('id', lapId)

    setVoidingId(null)

    if (error) {
      setError(error.message || 'Could not void lap.')
      return
    }

    setLapEvents(prev => prev.filter(row => row.id !== lapId))
  }

  const undoLast = async () => {
    if (!lastRow) return
    await voidLap(lastRow.id, 'Voided from timer undo last')
  }

  if (loading) {
    return (
      <div style={S.loadingPage}>
        Loading checkpoint timer…
      </div>
    )
  }

  return (
    <div style={S.page}>
      <link
        href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      <audio ref={audioRef} preload="auto">
        <source src="/sounds/timer-tap.mp3" type="audio/mpeg" />
      </audio>

      <div style={S.header}>
        <button type="button" style={S.backBtn} onClick={() => navigate(getRaceCheckpointsPath(eventId))}>
          ← Timer Devices
        </button>

        <button type="button" style={S.backBtn} onClick={() => navigate(getRaceSetupPath(eventId))}>
          Setup
        </button>
      </div>

      <div style={S.body}>
        <div style={S.topCard}>
          <div style={S.kicker}>Checkpoint Timer</div>
          <div style={S.title}>{checkpoint?.name || 'Checkpoint'}</div>
          <div style={S.subTitle}>{event?.name || 'Race'}</div>

          <div style={S.clockWrap}>
            <div style={S.clockLabel}>
              {event?.status === 'active' ? 'Race Clock' : 'Waiting'}
            </div>
            <div style={S.clockValue}>{formatRaceClock(elapsedMs)}</div>
          </div>

          <div style={S.metaRow}>
            <span style={S.badge}>
              {event?.status === 'active' ? 'LIVE' : (event?.status || 'DRAFT').toUpperCase()}
            </span>
            <span style={S.metaText}>
              {rows.length} recorded {rows.length === 1 ? 'pass' : 'passes'}
            </span>
          </div>
        </div>

        {error ? <div style={S.errorBox}>{error}</div> : null}

        <div style={{ ...S.captureCard, ...(flashOn ? S.captureCardFlash : null) }}>
          <button
            type="button"
            onClick={recordLap}
            disabled={!canRecord}
            style={{
              ...S.captureBtn,
              opacity: canRecord ? 1 : 0.6,
              cursor: canRecord ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Recording…' : 'Record Lap'}
          </button>

          <div style={S.actionRow}>
            <button
              type="button"
              onClick={undoLast}
              disabled={!canUndoLast || !!voidingId}
              style={{
                ...S.secondaryBtn,
                opacity: canUndoLast && !voidingId ? 1 : 0.6,
                cursor: canUndoLast && !voidingId ? 'pointer' : 'not-allowed',
              }}
            >
              Undo Last
            </button>
          </div>

          <div style={S.toggleRow}>
            <ToggleChip
              label="Sound"
              enabled={soundEnabled}
              onToggle={() => setSoundEnabled(v => !v)}
              styles={S}
            />
            <ToggleChip
              label="Haptic"
              enabled={hapticEnabled}
              onToggle={() => setHapticEnabled(v => !v)}
              styles={S}
            />
            <ToggleChip
              label="Flash"
              enabled={flashEnabled}
              onToggle={() => setFlashEnabled(v => !v)}
              styles={S}
            />
          </div>
        </div>

        <div style={S.listCard}>
          <div style={S.listHeader}>
            <div style={S.listTitle}>Recent Passes</div>
            <div style={S.listHint}>Newest first</div>
          </div>

          {rows.length === 0 ? (
            <div style={S.emptyState}>No passes recorded yet.</div>
          ) : (
            <div style={S.list}>
              {rows.map(row => (
                <div key={row.id} style={S.row}>
                  <div style={S.rowMain}>
                    <span style={S.place}>{row.visiblePlace}</span>
                    <span style={S.time}>{formatElapsed(row.elapsed_ms)}</span>
                    <span style={S.bib}>
                      {row.bib_number ? row.bib_number : '—'}
                    </span>
                    <span style={S.name}>
                      {row.athleteName || (row.bib_number ? 'Unknown athlete' : 'Unassigned')}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => voidLap(row.id, 'Voided from timer recent list')}
                    disabled={voidingId === row.id}
                    style={{
                      ...S.rowActionBtn,
                      opacity: voidingId === row.id ? 0.6 : 1,
                    }}
                  >
                    {voidingId === row.id ? 'Voiding…' : 'Void'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ToggleChip({ label, enabled, onToggle, styles }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        ...styles.toggleChip,
        ...(enabled ? styles.toggleChipOn : styles.toggleChipOff),
      }}
    >
      {label}: {enabled ? 'On' : 'Off'}
    </button>
  )
}

function getStyles(theme) {
  return {
    page: {
      minHeight: '100dvh',
      background: theme.pageBg,
      color: theme.text,
      padding: 16,
    },

    loadingPage: {
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: theme.pageBg,
      color: theme.textMuted,
      fontFamily: FB,
    },

    header: {
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap',
      marginBottom: 16,
    },

    backBtn: {
      height: 40,
      padding: '0 14px',
      borderRadius: 10,
      border: `1px solid ${theme.border}`,
      background: theme.cardBg,
      color: theme.text,
      cursor: 'pointer',
      fontFamily: F,
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: 1,
    },

    body: {
      maxWidth: 860,
      margin: '0 auto',
      display: 'grid',
      gap: 16,
    },

    topCard: {
      background: theme.cardBg,
      border: `1px solid ${theme.border}`,
      borderRadius: 18,
      padding: 18,
      boxShadow: theme.shadowSm,
    },

    kicker: {
      fontSize: 11,
      color: theme.secondaryText,
      textTransform: 'uppercase',
      letterSpacing: 2,
      marginBottom: 8,
      fontFamily: F,
      fontWeight: 800,
    },

    title: {
      fontSize: 28,
      lineHeight: 1,
      fontFamily: F,
      fontWeight: 900,
      color: theme.text,
      marginBottom: 6,
    },

    subTitle: {
      fontSize: 14,
      color: theme.textMuted,
      marginBottom: 16,
      fontFamily: FB,
    },

    clockWrap: {
      marginBottom: 14,
    },

    clockLabel: {
      fontSize: 11,
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1.6,
      fontFamily: F,
      fontWeight: 700,
      marginBottom: 6,
    },

    clockValue: {
      fontSize: 48,
      lineHeight: 1,
      letterSpacing: -1.5,
      fontFamily: F,
      fontWeight: 900,
      color: theme.text,
    },

    metaRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
    },

    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '6px 10px',
      borderRadius: 999,
      background: 'rgba(239,68,68,0.10)',
      color: '#ef4444',
      border: '1px solid rgba(239,68,68,0.25)',
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      fontFamily: F,
      fontWeight: 800,
    },

    metaText: {
      fontSize: 12,
      color: theme.textMuted,
      fontFamily: FB,
    },

    errorBox: {
      background: theme.dangerSurface || 'rgba(220,38,38,0.10)',
      border: `1px solid ${theme.dangerBorder || '#ef4444'}`,
      color: theme.dangerText || theme.text,
      borderRadius: 12,
      padding: 12,
      fontSize: 13,
    },

    captureCard: {
      background: theme.cardBg,
      border: `1px solid ${theme.border}`,
      borderRadius: 18,
      padding: 18,
      transition: 'box-shadow 120ms ease, border-color 120ms ease, background 120ms ease',
    },

    captureCardFlash: {
      boxShadow: '0 0 0 3px rgba(249,115,22,0.18)',
      border: '1px solid rgba(249,115,22,0.35)',
      background: theme.mode === 'light' ? '#fffaf5' : theme.cardBg,
    },

    captureBtn: {
      width: '100%',
      minHeight: 120,
      borderRadius: 18,
      border: 'none',
      background: 'linear-gradient(135deg, #f97316, #ea580c)',
      color: '#fff',
      fontFamily: F,
      fontWeight: 900,
      fontSize: 30,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      cursor: 'pointer',
      boxShadow: '0 10px 24px rgba(249,115,22,0.22)',
    },

    actionRow: {
      display: 'flex',
      gap: 10,
      marginTop: 12,
      flexWrap: 'wrap',
    },

    secondaryBtn: {
      height: 44,
      padding: '0 14px',
      borderRadius: 10,
      border: `1px solid ${theme.border}`,
      background: theme.cardAltBg || theme.secondaryBg,
      color: theme.text,
      cursor: 'pointer',
      fontFamily: F,
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: 1,
    },

    toggleRow: {
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap',
      marginTop: 12,
    },

    toggleChip: {
      height: 38,
      padding: '0 12px',
      borderRadius: 999,
      border: `1px solid ${theme.border}`,
      cursor: 'pointer',
      fontFamily: F,
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: 1,
    },

    toggleChipOn: {
      background: 'rgba(249,115,22,0.10)',
      color: '#f97316',
      border: '1px solid rgba(249,115,22,0.30)',
    },

    toggleChipOff: {
      background: theme.cardAltBg || theme.secondaryBg,
      color: theme.textMuted,
    },

    listCard: {
      background: theme.cardBg,
      border: `1px solid ${theme.border}`,
      borderRadius: 18,
      padding: 18,
      boxShadow: theme.shadowSm,
    },

    listHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 10,
      alignItems: 'baseline',
      flexWrap: 'wrap',
      marginBottom: 12,
    },

    listTitle: {
      fontSize: 18,
      color: theme.text,
      fontFamily: F,
      fontWeight: 800,
    },

    listHint: {
      fontSize: 12,
      color: theme.textMuted,
      fontFamily: FB,
    },

    emptyState: {
      color: theme.textMuted,
      fontSize: 13,
      padding: '8px 0',
    },

    list: {
      display: 'grid',
      gap: 10,
    },

    row: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      background: theme.cardAltBg || theme.secondaryBg,
      border: `1px solid ${theme.borderSoft || theme.border}`,
      borderRadius: 12,
      padding: 12,
    },

    rowMain: {
      display: 'grid',
      gridTemplateColumns: '52px 110px 100px minmax(0, 1fr)',
      gap: 10,
      alignItems: 'center',
      minWidth: 0,
      flex: 1,
    },

    place: {
      color: theme.secondaryText,
      fontFamily: F,
      fontWeight: 900,
      fontSize: 18,
    },

    time: {
      color: theme.text,
      fontFamily: F,
      fontWeight: 800,
      fontSize: 16,
    },

    bib: {
      color: theme.text,
      fontFamily: F,
      fontWeight: 700,
      fontSize: 15,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },

    name: {
      color: theme.textMuted,
      fontFamily: FB,
      fontSize: 13,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },

    rowActionBtn: {
      height: 38,
      padding: '0 12px',
      borderRadius: 10,
      border: '1px solid rgba(239,68,68,0.25)',
      background: 'rgba(239,68,68,0.08)',
      color: '#ef4444',
      cursor: 'pointer',
      fontFamily: F,
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      flexShrink: 0,
    },
  }
}