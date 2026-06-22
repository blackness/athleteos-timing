import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
    successBg: 'rgba(16,185,129,0.10)',
    successBorder: 'rgba(16,185,129,0.25)',
    warning: '#f59e0b',
    warningBg: 'rgba(245,158,11,0.10)',
    warningBorder: 'rgba(245,158,11,0.25)',
    danger: '#ef4444',
    dangerBg: 'rgba(239,68,68,0.08)',
    dangerBorder: 'rgba(239,68,68,0.30)',
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
    accent: '#ea580c',
    accentAlt: '#2563eb',
    buttonText: '#ffffff',
    success: '#16a34a',
    successBg: 'rgba(22,163,74,0.08)',
    successBorder: 'rgba(22,163,74,0.22)',
    warning: '#d97706',
    warningBg: 'rgba(217,119,6,0.08)',
    warningBorder: 'rgba(217,119,6,0.20)',
    danger: '#dc2626',
    dangerBg: 'rgba(220,38,38,0.06)',
    dangerBorder: 'rgba(220,38,38,0.25)',
    zebra: '#f8fafc',
  },
}

function fmt(ms, includeCenti = true) {
  if (ms == null) return '—'
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

function parseTimeToMs(value) {
  if (!value?.trim()) return null
  const s = value.trim()
  const parts = s.split(':')

  let hours = 0
  let minutes = 0
  let secondsPart = ''

  if (parts.length === 3) {
    hours = Number(parts[0])
    minutes = Number(parts[1])
    secondsPart = parts[2]
  } else if (parts.length === 2) {
    minutes = Number(parts[0])
    secondsPart = parts[1]
  } else if (parts.length === 1) {
    secondsPart = parts[0]
  } else {
    return null
  }

  if ([hours, minutes].some(Number.isNaN)) return null

  const [secStr, centiStr = '0'] = secondsPart.split('.')
  const seconds = Number(secStr)
  const centi = Number(String(centiStr).padEnd(2, '0').slice(0, 2))

  if ([seconds, centi].some(Number.isNaN)) return null

  return (hours * 3600 + minutes * 60 + seconds) * 1000 + centi * 10
}

function formatDelta(ms) {
  if (ms == null) return '—'
  const sign = ms > 0 ? '+' : ms < 0 ? '-' : '±'
  return `${sign}${fmt(Math.abs(ms), true)}`
}

function normalizeRows(data) {
  return (data || []).map(row => ({
    ...row,
    reason: row.reason ?? '',
    note: row.note ?? '',
    edited_elapsed_ms: row.adjusted_elapsed_ms ?? null,
    edited_elapsed_text: row.adjusted_elapsed_ms != null ? fmt(row.adjusted_elapsed_ms) : '',
  }))
}

function deriveRows(rows) {
  const sorted = [...rows].sort((a, b) => a.checkpoint_order - b.checkpoint_order)

  return sorted.map((row, idx, arr) => {
    const editedText = row.edited_elapsed_text ?? ''
    const parsedEdited =
      editedText.trim() === ''
        ? null
        : row.edited_elapsed_ms

    const effectiveElapsed = parsedEdited ?? row.raw_elapsed_ms ?? null

    const prevRaw = idx === 0 ? null : arr[idx - 1].raw_elapsed_ms
    const prevEffective = idx === 0
      ? null
      : (
          (arr[idx - 1].edited_elapsed_text ?? '').trim() === ''
            ? arr[idx - 1].raw_elapsed_ms
            : arr[idx - 1].edited_elapsed_ms
        )

    const rawSplit =
      row.raw_elapsed_ms == null
        ? null
        : idx === 0
          ? row.raw_elapsed_ms
          : prevRaw == null
            ? null
            : row.raw_elapsed_ms - prevRaw

    const effectiveSplit =
      effectiveElapsed == null
        ? null
        : idx === 0
          ? effectiveElapsed
          : prevEffective == null
            ? null
            : effectiveElapsed - prevEffective

    const dirty = parsedEdited != null && parsedEdited !== row.raw_elapsed_ms

    return {
      ...row,
      effective_elapsed_ms: effectiveElapsed,
      raw_split_ms: rawSplit,
      effective_split_ms: effectiveSplit,
      delta_ms:
        row.raw_elapsed_ms != null && effectiveElapsed != null
          ? effectiveElapsed - row.raw_elapsed_ms
          : null,
      dirty,
      parse_error:
        editedText.trim() !== '' && parsedEdited == null
          ? 'Invalid time format'
          : null,
    }
  })
}

function validateRows(rows) {
  const issues = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    if (row.parse_error) {
      issues.push(`${row.checkpoint_name}: ${row.parse_error}`)
      continue
    }

    if (row.effective_elapsed_ms != null && row.effective_elapsed_ms < 0) {
      issues.push(`${row.checkpoint_name}: time cannot be negative`)
    }

    if (i > 0) {
      const prev = rows[i - 1]
      if (
        row.effective_elapsed_ms != null &&
        prev.effective_elapsed_ms != null &&
        row.effective_elapsed_ms < prev.effective_elapsed_ms
      ) {
        issues.push(`${row.checkpoint_name}: cannot be earlier than previous checkpoint`)
      }
    }

    if (i > 0) {
      const prev = rows[i - 1]
      if (
        row.effective_split_ms != null &&
        prev.effective_elapsed_ms != null &&
        row.effective_split_ms < 0
      ) {
        issues.push(`${row.checkpoint_name}: split cannot be negative`)
      }
    }
  }

  return [...new Set(issues)]
}

export default function ResultCorrectionsPage() {
  const { id: eventId } = useParams()
  const navigate = useNavigate()

  const [theme, setTheme] = useState('light')
  const [event, setEvent] = useState(null)

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [rows, setRows] = useState([])

  const [loadingSearch, setLoadingSearch] = useState(false)
  const [loadingEntry, setLoadingEntry] = useState(false)
  const [saving, setSaving] = useState(false)

  const [globalReason, setGlobalReason] = useState('')
  const [globalNote, setGlobalNote] = useState('')
  const [message, setMessage] = useState('')

  const T = THEMES[theme]

  const effectiveRows = useMemo(() => deriveRows(rows), [rows])
  const validationIssues = useMemo(() => validateRows(effectiveRows), [effectiveRows])

  const rawFinish = useMemo(() => {
    const finish = effectiveRows.find(r => r.is_finish)
    return finish?.raw_elapsed_ms ?? null
  }, [effectiveRows])

  const effectiveFinish = useMemo(() => {
    const finish = effectiveRows.find(r => r.is_finish)
    return finish?.effective_elapsed_ms ?? null
  }, [effectiveRows])

  const correctedCount = useMemo(() => {
    return effectiveRows.filter(r => {
      const hasEditedOverride =
        r.edited_elapsed_text.trim() !== '' &&
        r.edited_elapsed_ms != null &&
        r.edited_elapsed_ms !== r.raw_elapsed_ms

      const hasExistingAdjustment =
        !!r.adjustment_id &&
        (r.edited_elapsed_text.trim() !== '' || r.reason || r.note)

      return hasEditedOverride || hasExistingAdjustment
    }).length
  }, [effectiveRows])

  useEffect(() => {
    async function loadEvent() {
      const { data } = await supabase
        .from('race_events')
        .select('id, name')
        .eq('id', eventId)
        .single()

      setEvent(data || null)
    }

    if (eventId) loadEvent()
  }, [eventId])

  const loadEntry = useCallback(async (entry) => {
    setSelectedEntry(entry)
    setLoadingEntry(true)
    setMessage('')

    const { data, error } = await supabase.rpc('get_entry_checkpoint_results', {
      p_event_id: eventId,
      p_entry_id: entry.id,
    })

    if (error) {
      setRows([])
      setLoadingEntry(false)
      setMessage(error.message || 'Failed to load checkpoint results')
      return
    }

    setRows(normalizeRows(data || []))
    setLoadingEntry(false)
  }, [eventId])

  useEffect(() => {
    const run = async () => {
      if (!query.trim()) {
        setSearchResults([])
        return
      }

      setLoadingSearch(true)
      const q = query.trim()

      const { data, error } = await supabase
        .from('event_entries')
        .select('id, bib_number, first_name, last_name, team, division, gender')
        .eq('event_id', eventId)
        .or(`bib_number.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,team.ilike.%${q}%`)
        .order('bib_number', { ascending: true })
        .limit(25)

      if (!error) {
        setSearchResults(data || [])
      }

      setLoadingSearch(false)
    }

    const t = setTimeout(run, 250)
    return () => clearTimeout(t)
  }, [eventId, query])

  const updateRowText = useCallback((checkpointId, text) => {
    setRows(prev =>
      prev.map(row => {
        if (row.checkpoint_id !== checkpointId) return row
        return {
          ...row,
          edited_elapsed_text: text,
          edited_elapsed_ms: text.trim() === '' ? null : parseTimeToMs(text),
        }
      })
    )
  }, [])

  const updateRowReason = useCallback((checkpointId, value) => {
    setRows(prev =>
      prev.map(row =>
        row.checkpoint_id === checkpointId
          ? { ...row, reason: value }
          : row
      )
    )
  }, [])

  const updateRowNote = useCallback((checkpointId, value) => {
    setRows(prev =>
      prev.map(row =>
        row.checkpoint_id === checkpointId
          ? { ...row, note: value }
          : row
      )
    )
  }, [])

  const quickAdjustRow = useCallback((checkpointId, deltaMs) => {
    setRows(prev =>
      prev.map(row => {
        if (row.checkpoint_id !== checkpointId) return row
        const base = row.edited_elapsed_text.trim() === ''
          ? (row.raw_elapsed_ms ?? 0)
          : (row.edited_elapsed_ms ?? row.raw_elapsed_ms ?? 0)

        const next = Math.max(0, base + deltaMs)

        return {
          ...row,
          edited_elapsed_ms: next,
          edited_elapsed_text: fmt(next),
        }
      })
    )
  }, [])

  const revertRow = useCallback((checkpointId) => {
    setRows(prev =>
      prev.map(row =>
        row.checkpoint_id === checkpointId
          ? {
              ...row,
              edited_elapsed_ms: null,
              edited_elapsed_text: '',
              reason: '',
              note: '',
            }
          : row
      )
    )
  }, [])

  const revertAll = useCallback(() => {
    setRows(prev =>
      prev.map(row => ({
        ...row,
        edited_elapsed_ms: null,
        edited_elapsed_text: '',
        reason: '',
        note: '',
      }))
    )
  }, [])

  const saveCorrections = useCallback(async () => {
    if (!selectedEntry) return

    if (validationIssues.length > 0) {
      setMessage(validationIssues[0])
      return
    }

    const hasAnyReasonOrNote =
      !!globalReason.trim() ||
      !!globalNote.trim() ||
      effectiveRows.some(row => !!row.reason?.trim() || !!row.note?.trim())

    if (!hasAnyReasonOrNote) {
      setMessage('Please enter a correction reason or note before saving.')
      return
    }

    setSaving(true)
    setMessage('')

    const reverted = effectiveRows.filter(
      row =>
        row.adjustment_id &&
        row.edited_elapsed_text.trim() === ''
    )

    if (reverted.length > 0) {
      const { error: deleteError } = await supabase
        .from('checkpoint_time_adjustments')
        .delete()
        .in('id', reverted.map(r => r.adjustment_id))

      if (deleteError) {
        setSaving(false)
        setMessage(deleteError.message || 'Failed to remove reverted adjustments')
        return
      }
    }

    const changed = effectiveRows.filter(
      row =>
        row.edited_elapsed_text.trim() !== '' &&
        row.edited_elapsed_ms != null &&
        row.edited_elapsed_ms !== row.raw_elapsed_ms
    )

    if (changed.length > 0) {
      const { data: authData } = await supabase.auth.getSession()
      const userId = authData?.session?.user?.id ?? null

      const payload = changed.map(row => ({
        event_id: eventId,
        entry_id: selectedEntry.id,
        checkpoint_id: row.checkpoint_id,
        original_elapsed_ms: row.raw_elapsed_ms,
        adjusted_elapsed_ms: row.edited_elapsed_ms,
        reason: row.reason?.trim() || globalReason.trim() || null,
        note: row.note?.trim() || globalNote.trim() || null,
        created_by: userId,
      }))

      const { error: upsertError } = await supabase
        .from('checkpoint_time_adjustments')
        .upsert(payload, { onConflict: 'event_id,entry_id,checkpoint_id' })

      if (upsertError) {
        setSaving(false)
        setMessage(upsertError.message || 'Failed to save adjustments')
        return
      }
    }

    setSaving(false)
    setMessage('Corrections saved')
    await loadEntry(selectedEntry)
  }, [selectedEntry, validationIssues, globalReason, globalNote, effectiveRows, eventId, loadEntry])

  const headerButton = {
    height: 36,
    padding: '0 12px',
    borderRadius: 10,
    border: `1px solid ${T.border2}`,
    background: T.panel2,
    color: T.textStrong,
    cursor: 'pointer',
    fontFamily: F,
    fontWeight: 800,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  }

  const quickBtn = {
    height: 28,
    padding: '0 8px',
    borderRadius: 8,
    border: `1px solid ${T.border2}`,
    background: T.panel2,
    color: T.textStrong,
    cursor: 'pointer',
    fontFamily: F,
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  }

  return (
    <div style={{ minHeight: '100dvh', background: T.bg, color: T.text, fontFamily: FB }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />

      <div
        style={{
          padding: '14px 16px',
          borderBottom: `1px solid ${T.border}`,
          background: T.pageAlt,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: T.muted,
              letterSpacing: 1.8,
              textTransform: 'uppercase',
              fontFamily: F,
              fontWeight: 700,
            }}
          >
            Admin · Result Corrections
          </div>

          <div
            style={{
              marginTop: 4,
              fontSize: 34,
              fontWeight: 900,
              color: T.textStrong,
              fontFamily: F,
              lineHeight: 1,
            }}
          >
            {event?.name || 'Race Event'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate(`/race/${eventId}/checkpoints`)}
            style={headerButton}
          >
            ← Back
          </button>
          <button
            onClick={() => setTheme('light')}
            style={{
              ...headerButton,
              background: theme === 'light' ? T.accentAlt : T.panel2,
              color: theme === 'light' ? '#fff' : T.textStrong,
            }}
          >
            Light
          </button>
          <button
            onClick={() => setTheme('dark')}
            style={{
              ...headerButton,
              background: theme === 'dark' ? T.accentAlt : T.panel2,
              color: theme === 'dark' ? '#fff' : T.textStrong,
            }}
          >
            Dark
          </button>
        </div>
      </div>

      <div
        className="result-corrections-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '320px 1fr',
          gap: 18,
          padding: 18,
        }}
      >
        <div
          style={{
            background: T.panel,
            border: `1px solid ${T.border}`,
            borderRadius: 18,
            padding: 14,
            alignSelf: 'start',
          }}
        >
          <div
            style={{
              fontSize: 14,
              color: T.textStrong,
              fontFamily: F,
              fontWeight: 800,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            Search Entry
          </div>

          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Bib, name, team"
            style={{
              width: '100%',
              height: 46,
              background: T.inputBg,
              border: `1px solid ${T.inputBorder}`,
              borderRadius: 12,
              color: T.textStrong,
              padding: '0 12px',
              outline: 'none',
              marginBottom: 12,
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loadingSearch ? (
              <div style={{ color: T.muted, padding: '6px 2px' }}>Searching…</div>
            ) : searchResults.length === 0 ? (
              <div style={{ color: T.dim, padding: '6px 2px' }}>
                {query.trim() ? 'No entries found' : 'Start typing to search'}
              </div>
            ) : (
              searchResults.map(entry => (
                <button
                  key={entry.id}
                  onClick={() => loadEntry(entry)}
                  style={{
                    textAlign: 'left',
                    background: selectedEntry?.id === entry.id ? T.panel2 : 'transparent',
                    border: `1px solid ${selectedEntry?.id === entry.id ? T.border2 : T.border}`,
                    borderRadius: 12,
                    padding: 12,
                    color: T.text,
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 900,
                      color: T.textStrong,
                      fontFamily: F,
                      lineHeight: 1,
                    }}
                  >
                    #{entry.bib_number} {entry.first_name} {entry.last_name}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: T.muted }}>
                    {entry.team || '—'}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11, color: T.dim }}>
                    {entry.division || '—'} {entry.gender ? `· ${entry.gender}` : ''}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div
          style={{
            background: T.panel,
            border: `1px solid ${T.border}`,
            borderRadius: 18,
            padding: 14,
            minWidth: 0,
          }}
        >
          {!selectedEntry ? (
            <div style={{ color: T.dim, padding: '10px 2px' }}>
              Select an entry to review and adjust checkpoint times.
            </div>
          ) : loadingEntry ? (
            <div style={{ color: T.muted, padding: '10px 2px' }}>
              Loading checkpoint results…
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 1fr',
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    background: T.panel2,
                    border: `1px solid ${T.border2}`,
                    borderRadius: 16,
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: 900,
                      color: T.textStrong,
                      fontFamily: F,
                      lineHeight: 1,
                    }}
                  >
                    #{selectedEntry.bib_number} {selectedEntry.first_name} {selectedEntry.last_name}
                  </div>

                  <div style={{ marginTop: 6, color: T.muted }}>
                    {selectedEntry.team || '—'}
                  </div>

                  <div style={{ marginTop: 6, fontSize: 12, color: T.dim }}>
                    {selectedEntry.division || '—'} {selectedEntry.gender ? `· ${selectedEntry.gender}` : ''}
                  </div>
                </div>

                <div
                  style={{
                    background: T.panel2,
                    border: `1px solid ${T.border2}`,
                    borderRadius: 16,
                    padding: 14,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 10, color: T.muted2, textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: F, fontWeight: 700 }}>
                      Raw Finish
                    </div>
                    <div style={{ marginTop: 4, fontSize: 24, color: T.textStrong, fontFamily: F, fontWeight: 900 }}>
                      {fmt(rawFinish)}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 10, color: T.muted2, textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: F, fontWeight: 700 }}>
                      Official Finish
                    </div>
                    <div style={{ marginTop: 4, fontSize: 24, color: T.textStrong, fontFamily: F, fontWeight: 900 }}>
                      {fmt(effectiveFinish)}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 10, color: T.muted2, textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: F, fontWeight: 700 }}>
                      Corrected Checkpoints
                    </div>
                    <div style={{ marginTop: 4, fontSize: 24, color: T.textStrong, fontFamily: F, fontWeight: 900 }}>
                      {correctedCount}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 10, color: T.muted2, textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: F, fontWeight: 700 }}>
                      Status
                    </div>
                    <div style={{ marginTop: 7, fontSize: 12, color: validationIssues.length ? T.danger : T.success }}>
                      {validationIssues.length ? 'Needs review' : 'Ready to save'}
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <input
                  value={globalReason}
                  onChange={e => setGlobalReason(e.target.value)}
                  placeholder="Default reason for changed checkpoints"
                  style={{
                    width: '100%',
                    height: 42,
                    background: T.inputBg,
                    border: `1px solid ${T.inputBorder}`,
                    borderRadius: 10,
                    color: T.textStrong,
                    padding: '0 12px',
                    outline: 'none',
                  }}
                />

                <input
                  value={globalNote}
                  onChange={e => setGlobalNote(e.target.value)}
                  placeholder="Default note for changed checkpoints"
                  style={{
                    width: '100%',
                    height: 42,
                    background: T.inputBg,
                    border: `1px solid ${T.inputBorder}`,
                    borderRadius: 10,
                    color: T.textStrong,
                    padding: '0 12px',
                    outline: 'none',
                  }}
                />
              </div>

              {validationIssues.length > 0 && (
                <div
                  style={{
                    marginBottom: 14,
                    border: `1px solid ${T.dangerBorder}`,
                    background: T.dangerBg,
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: T.danger,
                      fontFamily: F,
                      fontWeight: 900,
                      letterSpacing: 1.5,
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    }}
                  >
                    Validation Issues
                  </div>

                  {validationIssues.map(issue => (
                    <div key={issue} style={{ color: T.danger, fontSize: 13 }}>
                      {issue}
                    </div>
                  ))}
                </div>
              )}

              <div
                style={{
                  overflowX: 'auto',
                  border: `1px solid ${T.border}`,
                  borderRadius: 16,
                }}
              >
                <table style={{ width: '100%', minWidth: 1460, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: T.pageAlt }}>
                      <th style={thStyle(T)} align="left">#</th>
                      <th style={thStyle(T)} align="left">Checkpoint</th>
                      <th style={thStyle(T)} align="left">Raw Cum</th>
                      <th style={thStyle(T)} align="left">Raw Split</th>
                      <th style={thStyle(T)} align="left">Corrected Cum</th>
                      <th style={thStyle(T)} align="left">Effective Split</th>
                      <th style={thStyle(T)} align="left">Delta</th>
                      <th style={thStyle(T)} align="left">Reason</th>
                      <th style={thStyle(T)} align="left">Note</th>
                      <th style={thStyle(T)} align="left">Quick</th>
                      <th style={thStyle(T)} align="left">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {effectiveRows.map((row, idx) => (
                      <tr
                        key={row.checkpoint_id}
                        style={{
                          background: idx % 2 === 0 ? 'transparent' : T.zebra,
                          borderTop: `1px solid ${T.faint}`,
                        }}
                      >
                        <td style={tdStyle()}>{row.checkpoint_order}</td>

                        <td style={tdStyle()}>
                          <div style={{ color: T.textStrong, fontWeight: 700 }}>
                            {row.checkpoint_name}
                          </div>
                          {row.is_finish && (
                            <div style={{ marginTop: 3, fontSize: 10, color: T.accentAlt, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                              Finish
                            </div>
                          )}
                        </td>

                        <td style={{ ...tdStyle(), fontFamily: F, fontWeight: 800 }}>
                          {fmt(row.raw_elapsed_ms)}
                        </td>

                        <td style={{ ...tdStyle(), fontFamily: F, fontWeight: 800 }}>
                          {fmt(row.raw_split_ms)}
                        </td>

                        <td style={tdStyle()}>
                          <input
                            value={row.edited_elapsed_text}
                            onChange={e => updateRowText(row.checkpoint_id, e.target.value)}
                            placeholder={fmt(row.raw_elapsed_ms)}
                            style={{
                              width: 132,
                              height: 36,
                              background: T.inputBg,
                              border: `1px solid ${row.parse_error ? T.danger : T.inputBorder}`,
                              borderRadius: 8,
                              color: T.textStrong,
                              padding: '0 10px',
                              outline: 'none',
                              fontFamily: F,
                              fontWeight: 700,
                            }}
                          />
                          {row.parse_error && (
                            <div style={{ marginTop: 4, fontSize: 11, color: T.danger }}>
                              {row.parse_error}
                            </div>
                          )}
                        </td>

                        <td style={{ ...tdStyle(), fontFamily: F, fontWeight: 800 }}>
                          {fmt(row.effective_split_ms)}
                        </td>

                        <td
                          style={{
                            ...tdStyle(),
                            fontFamily: F,
                            fontWeight: 800,
                            color:
                              row.delta_ms == null
                                ? T.dim
                                : row.delta_ms > 0
                                  ? T.warning
                                  : row.delta_ms < 0
                                    ? T.accentAlt
                                    : T.muted,
                          }}
                        >
                          {formatDelta(row.delta_ms)}
                        </td>

                        <td style={tdStyle()}>
                          <input
                            value={row.reason || ''}
                            onChange={e => updateRowReason(row.checkpoint_id, e.target.value)}
                            placeholder={globalReason || 'Reason'}
                            style={{
                              width: 150,
                              height: 34,
                              background: T.inputBg,
                              border: `1px solid ${T.inputBorder}`,
                              borderRadius: 8,
                              color: T.textStrong,
                              padding: '0 10px',
                              outline: 'none',
                            }}
                          />
                        </td>

                        <td style={tdStyle()}>
                          <input
                            value={row.note || ''}
                            onChange={e => updateRowNote(row.checkpoint_id, e.target.value)}
                            placeholder={globalNote || 'Note'}
                            style={{
                              width: 180,
                              height: 34,
                              background: T.inputBg,
                              border: `1px solid ${T.inputBorder}`,
                              borderRadius: 8,
                              color: T.textStrong,
                              padding: '0 10px',
                              outline: 'none',
                            }}
                          />
                        </td>

                        <td style={tdStyle()}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button style={quickBtn} onClick={() => quickAdjustRow(row.checkpoint_id, 30000)}>+0:30</button>
                            <button style={quickBtn} onClick={() => quickAdjustRow(row.checkpoint_id, 60000)}>+1:00</button>
                            <button style={quickBtn} onClick={() => quickAdjustRow(row.checkpoint_id, -30000)}>-0:30</button>
                            <button style={quickBtn} onClick={() => quickAdjustRow(row.checkpoint_id, -60000)}>-1:00</button>
                          </div>
                        </td>

                        <td style={tdStyle()}>
                          <button
                            onClick={() => revertRow(row.checkpoint_id)}
                            style={{
                              ...quickBtn,
                              border: `1px solid ${T.dangerBorder}`,
                              color: T.danger,
                            }}
                          >
                            Revert
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <button
                  onClick={saveCorrections}
                  disabled={saving || validationIssues.length > 0}
                  style={{
                    height: 42,
                    padding: '0 16px',
                    borderRadius: 10,
                    border: 'none',
                    background: T.accent,
                    color: T.buttonText,
                    cursor: saving || validationIssues.length > 0 ? 'not-allowed' : 'pointer',
                    fontFamily: F,
                    fontWeight: 900,
                    fontSize: 12,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    opacity: saving || validationIssues.length > 0 ? 0.5 : 1,
                  }}
                >
                  {saving ? 'Saving…' : 'Save Corrections'}
                </button>

                <button
                  onClick={revertAll}
                  style={{
                    height: 42,
                    padding: '0 16px',
                    borderRadius: 10,
                    border: `1px solid ${T.border2}`,
                    background: 'transparent',
                    color: T.textStrong,
                    cursor: 'pointer',
                    fontFamily: F,
                    fontWeight: 800,
                    fontSize: 12,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                  }}
                >
                  Revert All
                </button>
              </div>

              {message && (
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 13,
                    color: validationIssues.length ? T.danger : T.warning,
                  }}
                >
                  {message}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .result-corrections-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}

function thStyle(T) {
  return {
    padding: '10px 10px',
    fontSize: 10,
    color: T.muted2,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontFamily: F,
    fontWeight: 800,
    borderBottom: `1px solid ${T.border}`,
    whiteSpace: 'nowrap',
  }
}

function tdStyle() {
  return {
    padding: '10px 10px',
    verticalAlign: 'top',
    whiteSpace: 'nowrap',
  }
}