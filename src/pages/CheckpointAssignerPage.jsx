import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../contexts/ThemeContext'
import { getRaceCheckpointsPath, getRaceSetupPath } from '../lib/routes'
import { getRaceElapsedMs, formatRaceClock } from '../lib/raceClock' // adjust if needed

const F = `'Barlow Condensed', sans-serif`
const FB = `'Barlow', sans-serif`

const UNKNOWN_BIB = 'UNKNOWN'
const NO_BIB = 'NO BIB'
const DUPLICATE_WARNING_WINDOW_MS = 10_000

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

function formatElapsed(ms) {
  return formatRaceClock(ms || 0)
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

function isUnknownBib(value) {
  const v = String(value || '').trim().toUpperCase()
  return v === UNKNOWN_BIB || v === NO_BIB
}

function isUnassignedRow(row) {
  const bib = String(row?.bib_number || '').trim()
  return !bib
}

function findNextUnassignedRow(rows) {
  return rows.find(isUnassignedRow) || null
}

function hasNearbyDuplicate(rows, targetRow, bib) {
  const normalizedBib = String(bib || '').trim()
  if (!normalizedBib) return false
  if (isUnknownBib(normalizedBib)) return false

  const targetElapsed = Number(targetRow?.elapsed_ms) || 0

  return rows.some(row => {
    if (row.id === targetRow?.id) return false
    if (String(row.bib_number || '').trim() !== normalizedBib) return false

    const rowElapsed = Number(row.elapsed_ms) || 0
    return Math.abs(rowElapsed - targetElapsed) <= DUPLICATE_WARNING_WINDOW_MS
  })
}

export default function CheckpointAssignerPage() {
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
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [selectedLapId, setSelectedLapId] = useState(null)
  const [bibInput, setBibInput] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [nowMs, setNowMs] = useState(Date.now())

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
    setWarning('')

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
        'Failed to load checkpoint assigner.'
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
      .channel(`checkpoint-assigner:${checkpointId}`)
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

  const nextUnassignedRow = useMemo(() => findNextUnassignedRow(rows), [rows])

  const selectedRow = useMemo(() => {
    return rows.find(row => row.id === selectedLapId) || null
  }, [rows, selectedLapId])

  useEffect(() => {
    if (selectedRow) return

    if (nextUnassignedRow) {
      setSelectedLapId(nextUnassignedRow.id)
      return
    }

    if (rows[0]) {
      setSelectedLapId(rows[0].id)
    }
  }, [selectedRow, nextUnassignedRow, rows])

  useEffect(() => {
    if (!selectedRow) {
      setBibInput('')
      setNameInput('')
      return
    }

    setBibInput(selectedRow.bib_number || '')
    setNameInput(selectedRow.athleteName || '')
    setWarning('')
  }, [selectedRow])

  const assignBib = async (rawBib, manualName = '') => {
    if (!selectedRow || saving) return

    const normalizedBib = String(rawBib || '').trim()
    const normalizedName = String(manualName || '').trim()

    if (!normalizedBib) {
      setWarning('Enter a bib/race number, or use UNKNOWN / NO BIB.')
      return
    }

    const matchedEntry = entryMap[normalizedBib] || null
    const duplicateWarning = hasNearbyDuplicate(rows, selectedRow, normalizedBib)

    let warningParts = []

    if (!matchedEntry && !isUnknownBib(normalizedBib)) {
      warningParts.push('Bib not found in roster.')
    }

    if (duplicateWarning) {
      warningParts.push('This bib already has a nearby checkpoint pass.')
    }

    setWarning(warningParts.join(' '))

    setSaving(true)
    setError('')

    const updatePayload = {
      bib_number: normalizedBib,
      status: 'assigned',
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (matchedEntry?.id) {
      updatePayload.entry_id = matchedEntry.id
    } else {
      updatePayload.entry_id = null
    }

    if (!matchedEntry && normalizedName) {
      updatePayload.correction_note = `Manual name: ${normalizedName}`
    }

    const { error } = await supabase
      .from('lap_events')
      .update(updatePayload)
      .eq('id', selectedRow.id)

    setSaving(false)

    if (error) {
      setError(error.message || 'Could not assign bib.')
      return
    }

    await loadLapEvents()

    setBibInput('')
    setNameInput('')

    window.setTimeout(() => {
      const latestRows = getVisibleCheckpointRows(
        lapEvents.map(row =>
          row.id === selectedRow.id
            ? {
                ...row,
                bib_number: normalizedBib,
                status: 'assigned',
                entry_id: matchedEntry?.id || null,
              }
            : row
        ),
        entryMap
      )

      const next = findNextUnassignedRow(latestRows)
      if (next) {
        setSelectedLapId(next.id)
      }
    }, 0)
  }

  const selectRow = row => {
    setSelectedLapId(row.id)
  }

  const elapsedDisplay = selectedRow ? formatElapsed(selectedRow.elapsed_ms) : '—'
  const selectedName = selectedRow?.athleteName || ''

  if (loading) {
    return (
      <div style={S.loadingPage}>
        Loading checkpoint assigner…
      </div>
    )
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
          ? 'Assign bibs to recorded finishers.'
          : 'Assign bibs to recorded checkpoint passes.'}
      </div>
    </div>

    {/* Main */}
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
      {/* Next unassigned focus */}
      <div
        style={{
          borderRadius: 16,
          border: `1px solid ${T.warningBorder}`,
          background: T.warningBg,
          padding: '14px 16px',
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
          {isFinishCheckpoint ? 'Next Finisher to Assign' : 'Next Checkpoint Pass to Assign'}
        </div>

        <div
          style={{
            marginTop: 6,
            fontSize: 22,
            color: nextPending ? T.textStrong : T.muted2,
            fontFamily: F,
            fontWeight: 900,
            lineHeight: 1,
          }}
        >
          {nextPending
            ? isFinishCheckpoint
              ? `Place ${activePlaceByLapId[nextPending.id] ?? '—'} · ${fmt(nextPending.elapsed_ms, true)}`
              : `Awaiting Bib · ${fmt(nextPending.elapsed_ms, true)}`
            : actionWaitingLabel}
        </div>

        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: T.muted,
          }}
        >
          {nextPending
            ? 'You can assign this row or select any row below.'
            : 'No pending rows right now.'}
        </div>
      </div>

      {/* Preview / warnings */}
      <div
        style={{
          minHeight: 18,
          fontSize: 12,
        }}
      >
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

      {/* Assign panel */}
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
            letterSpacing: 1.4,
            fontFamily: F,
            fontWeight: 700,
          }}
        >
          {isFinishCheckpoint ? 'Assign Bib' : 'Assign Bib'}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            value={bibInput}
            onChange={e => setBibInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') assignBib()
              if (e.key === 'Escape') {
                setBibInput('')
                setPreview(null)
              }
            }}
            placeholder="Bib #"
            disabled={!nextPending}
            style={{
              flex: 1,
              height: 64,
              background: T.inputBg,
              border: `1px solid ${T.inputBorder}`,
              borderRadius: 12,
              color: T.textStrong,
              fontSize: 30,
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
            onClick={assignBib}
            disabled={!bibInput.trim() || !nextPending || savingAssign}
            style={{
              width: 120,
              height: 64,
              background: T.success,
              border: 'none',
              borderRadius: 12,
              color: T.buttonText,
              fontSize: 16,
              fontWeight: 900,
              cursor: !bibInput.trim() || !nextPending || savingAssign ? 'not-allowed' : 'pointer',
              fontFamily: F,
              letterSpacing: 1.2,
              opacity: !bibInput.trim() || !nextPending || savingAssign ? 0.35 : 1,
              textTransform: 'uppercase',
            }}
          >
            {savingAssign ? '…' : 'Assign'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => assignSpecialBib('UNKNOWN')}
            disabled={!nextPending || savingAssign}
            style={{
              flex: 1,
              height: 42,
              borderRadius: 10,
              border: `1px solid ${T.warningBorder}`,
              background: 'transparent',
              color: nextPending ? T.warning : T.dim,
              fontFamily: F,
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
              cursor: nextPending ? 'pointer' : 'not-allowed',
              opacity: nextPending ? 1 : 0.5,
            }}
          >
            Unknown
          </button>

          <button
            onClick={() => assignSpecialBib('NO BIB')}
            disabled={!nextPending || savingAssign}
            style={{
              flex: 1,
              height: 42,
              borderRadius: 10,
              border: `1px solid ${T.warningBorder}`,
              background: 'transparent',
              color: nextPending ? T.warning : T.dim,
              fontFamily: F,
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
              cursor: nextPending ? 'pointer' : 'not-allowed',
              opacity: nextPending ? 1 : 0.5,
            }}
          >
            No Bib
          </button>
        </div>
      </div>

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
          {isFinishCheckpoint ? 'Finish Queue' : 'Checkpoint Queue'}
        </div>

        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {[...laps]
            .filter(l => l.status !== 'void')
            .sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))
            .map(l => {
              const bib = l.bib_number || '—'
              const name = l.bib_number ? getEntryDisplayName(l.bib_number) : 'Pending tap'
              const isPending = !l.bib_number

              return (
                <button
                  key={l.id}
                  onClick={() => selectPendingLap(l)}
                  style={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: '64px 90px 70px 1fr',
                    padding: '10px 14px',
                    border: 'none',
                    borderBottom: `1px solid ${T.faint}`,
                    alignItems: 'center',
                    gap: 8,
                    background: selectedLapId === l.id
                      ? T.pendingNext
                      : isPending
                        ? T.pendingBg
                        : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: isPending ? T.warning : T.muted2,
                      fontFamily: F,
                      fontWeight: 800,
                    }}
                  >
                    {activePlaceByLapId[l.id] ?? '—'}
                  </span>

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
                </button>
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
      maxWidth: 980,
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
      background: 'rgba(59,130,246,0.10)',
      color: '#60a5fa',
      border: '1px solid rgba(59,130,246,0.25)',
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

    warningBox: {
      background: theme.warningSurface || 'rgba(245,158,11,0.10)',
      border: `1px solid ${theme.warningBorder || 'rgba(245,158,11,0.30)'}`,
      color: theme.warningText || theme.text,
      borderRadius: 12,
      padding: 12,
      fontSize: 13,
    },

    panelGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1.25fr',
      gap: 16,
    },

    panel: {
      background: theme.cardBg,
      border: `1px solid ${theme.border}`,
      borderRadius: 18,
      padding: 18,
      boxShadow: theme.shadowSm,
    },

    panelLabel: {
      fontSize: 12,
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1.4,
      marginBottom: 10,
      fontFamily: F,
      fontWeight: 800,
    },

    focusCard: {
      background: theme.cardAltBg || theme.secondaryBg,
      border: `1px solid ${theme.borderSoft || theme.border}`,
      borderRadius: 14,
      padding: 12,
      display: 'grid',
      gap: 10,
    },

    focusCardSelected: {
      background: theme.mode === 'light' ? '#fffaf5' : (theme.cardAltBg || theme.secondaryBg),
      border: '1px solid rgba(249,115,22,0.30)',
      borderRadius: 14,
      padding: 12,
      marginBottom: 12,
    },

    focusLine: {
      display: 'grid',
      gridTemplateColumns: '48px 110px 110px minmax(0, 1fr)',
      gap: 10,
      alignItems: 'center',
      minWidth: 0,
    },

    focusPlace: {
      color: theme.secondaryText,
      fontFamily: F,
      fontWeight: 900,
      fontSize: 22,
    },

    focusTime: {
      color: theme.text,
      fontFamily: F,
      fontWeight: 800,
      fontSize: 18,
    },

    focusBib: {
      color: theme.text,
      fontFamily: F,
      fontWeight: 700,
      fontSize: 16,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },

    focusName: {
      color: theme.textMuted,
      fontFamily: FB,
      fontSize: 13,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },

    smallActionBtn: {
      height: 40,
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

    assignBlock: {
      display: 'grid',
      gap: 10,
    },

    bigInput: {
      width: '100%',
      height: 54,
      borderRadius: 12,
      border: `1px solid ${theme.border}`,
      background: theme.pageBg,
      color: theme.text,
      padding: '0 14px',
      fontSize: 22,
      fontFamily: F,
      fontWeight: 700,
      outline: 'none',
    },

    subInput: {
      width: '100%',
      height: 44,
      borderRadius: 10,
      border: `1px solid ${theme.border}`,
      background: theme.pageBg,
      color: theme.text,
      padding: '0 12px',
      fontSize: 14,
      fontFamily: FB,
      outline: 'none',
    },

    assignBtn: {
      width: '100%',
      minHeight: 58,
      borderRadius: 14,
      border: 'none',
      background: 'linear-gradient(135deg, #f97316, #ea580c)',
      color: '#fff',
      fontFamily: F,
      fontWeight: 900,
      fontSize: 24,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      boxShadow: '0 10px 24px rgba(249,115,22,0.22)',
    },

    quickRow: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10,
    },

    quickBtn: {
      height: 46,
      borderRadius: 10,
      border: `1px solid ${theme.border}`,
      background: theme.cardAltBg || theme.secondaryBg,
      color: theme.text,
      cursor: 'pointer',
      fontFamily: F,
      fontWeight: 800,
      fontSize: 13,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
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
      cursor: 'pointer',
      textAlign: 'left',
    },

    rowSelected: {
      border: '1px solid rgba(249,115,22,0.30)',
      boxShadow: '0 0 0 2px rgba(249,115,22,0.10)',
      background: theme.mode === 'light' ? '#fffaf5' : (theme.cardAltBg || theme.secondaryBg),
    },

    rowUnassigned: {
      border: '1px solid rgba(245,158,11,0.30)',
    },

    rowMain: {
      display: 'grid',
      gridTemplateColumns: '52px 110px 110px minmax(0, 1fr)',
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

    rowBadgeWrap: {
      flexShrink: 0,
    },

    pendingBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '6px 10px',
      borderRadius: 999,
      background: 'rgba(245,158,11,0.10)',
      color: '#f59e0b',
      border: '1px solid rgba(245,158,11,0.25)',
      fontSize: 11,
      fontFamily: F,
      fontWeight: 800,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },

    unknownBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '6px 10px',
      borderRadius: 999,
      background: 'rgba(168,85,247,0.10)',
      color: '#a855f7',
      border: '1px solid rgba(168,85,247,0.25)',
      fontSize: 11,
      fontFamily: F,
      fontWeight: 800,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },

    assignedBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '6px 10px',
      borderRadius: 999,
      background: 'rgba(16,185,129,0.10)',
      color: '#10b981',
      border: '1px solid rgba(16,185,129,0.25)',
      fontSize: 11,
      fontFamily: F,
      fontWeight: 800,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
  }
}