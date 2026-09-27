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
    <div style={S.page}>
      <link
        href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

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
          <div style={S.kicker}>Checkpoint Assigner</div>
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
        {warning ? <div style={S.warningBox}>{warning}</div> : null}

        <div style={S.panelGrid}>
          <div style={S.panel}>
            <div style={S.panelLabel}>Next Unassigned</div>

            {nextUnassignedRow ? (
              <div style={S.focusCard}>
                <div style={S.focusLine}>
                  <span style={S.focusPlace}>{nextUnassignedRow.visiblePlace}</span>
                  <span style={S.focusTime}>{formatElapsed(nextUnassignedRow.elapsed_ms)}</span>
                  <span style={S.focusBib}>—</span>
                  <span style={S.focusName}>Unassigned</span>
                </div>

                <button
                  type="button"
                  onClick={() => selectRow(nextUnassignedRow)}
                  style={S.smallActionBtn}
                >
                  Select
                </button>
              </div>
            ) : (
              <div style={S.emptyState}>No unassigned passes right now.</div>
            )}
          </div>

          <div style={S.panel}>
            <div style={S.panelLabel}>Selected Row</div>

            {selectedRow ? (
              <>
                <div style={S.focusCardSelected}>
                  <div style={S.focusLine}>
                    <span style={S.focusPlace}>{selectedRow.visiblePlace}</span>
                    <span style={S.focusTime}>{elapsedDisplay}</span>
                    <span style={S.focusBib}>{selectedRow.bib_number || '—'}</span>
                    <span style={S.focusName}>{selectedName || 'Unassigned'}</span>
                  </div>
                </div>

                <div style={S.assignBlock}>
                  <input
                    value={bibInput}
                    onChange={e => setBibInput(e.target.value)}
                    placeholder="Enter bib / race number"
                    style={S.bigInput}
                  />

                  {!entryMap[String(bibInput || '').trim()] && !isUnknownBib(bibInput) ? (
                    <input
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      placeholder="Optional athlete name if bib is unknown"
                      style={S.subInput}
                    />
                  ) : null}

                  <button
                    type="button"
                    onClick={() => assignBib(bibInput, nameInput)}
                    disabled={!selectedRow || saving}
                    style={{
                      ...S.assignBtn,
                      opacity: !selectedRow || saving ? 0.65 : 1,
                      cursor: !selectedRow || saving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {saving ? 'Assigning…' : 'Assign'}
                  </button>

                  <div style={S.quickRow}>
                    <button
                      type="button"
                      onClick={() => assignBib(UNKNOWN_BIB)}
                      disabled={!selectedRow || saving}
                      style={{
                        ...S.quickBtn,
                        opacity: !selectedRow || saving ? 0.65 : 1,
                      }}
                    >
                      UNKNOWN
                    </button>

                    <button
                      type="button"
                      onClick={() => assignBib(NO_BIB)}
                      disabled={!selectedRow || saving}
                      style={{
                        ...S.quickBtn,
                        opacity: !selectedRow || saving ? 0.65 : 1,
                      }}
                    >
                      NO BIB
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={S.emptyState}>Select a row to assign.</div>
            )}
          </div>
        </div>

        <div style={S.listCard}>
          <div style={S.listHeader}>
            <div style={S.listTitle}>Checkpoint Passes</div>
            <div style={S.listHint}>Newest first</div>
          </div>

          {rows.length === 0 ? (
            <div style={S.emptyState}>No passes recorded yet.</div>
          ) : (
            <div style={S.list}>
              {rows.map(row => {
                const selected = row.id === selectedLapId
                const unassigned = isUnassignedRow(row)
                const unknown = isUnknownBib(row.bib_number)

                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => selectRow(row)}
                    style={{
                      ...S.row,
                      ...(selected ? S.rowSelected : null),
                      ...(unassigned ? S.rowUnassigned : null),
                    }}
                  >
                    <div style={S.rowMain}>
                      <span style={S.place}>{row.visiblePlace}</span>
                      <span style={S.time}>{formatElapsed(row.elapsed_ms)}</span>
                      <span style={S.bib}>
                        {row.bib_number || '—'}
                      </span>
                      <span style={S.name}>
                        {row.athleteName || (unknown ? 'Unknown athlete' : row.bib_number ? 'Unmatched bib' : 'Unassigned')}
                      </span>
                    </div>

                    <div style={S.rowBadgeWrap}>
                      {unassigned ? (
                        <span style={S.pendingBadge}>Unassigned</span>
                      ) : unknown ? (
                        <span style={S.unknownBadge}>Unknown</span>
                      ) : (
                        <span style={S.assignedBadge}>Assigned</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
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