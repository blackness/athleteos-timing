import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { exportRawLapEvents, exportLapSummary } from '../lib/exportLapResults'
import { getRaceElapsedMs, formatRaceClock } from '../lib/raceClock'

// ── CSV parsing ────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  const sep = lines[0].includes('\t') ? '\t' : ','
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map(line =>
    line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
  )
  return { headers, rows }
}

const FIELD_LABELS = {
  bib_number: 'Bib #',
  first_name: 'First Name',
  last_name: 'Last Name',
  full_name: 'Full Name',
  team: 'Team / Club',
  division: 'Division',
  age: 'Age',
  gender: 'Gender',
  skip: '— Skip —',
}

function autoMap(headers) {
  const map = {}
  const lower = headers.map(h => h.toLowerCase())
  const guess = (field, patterns) => {
    const i = lower.findIndex(h => patterns.some(p => h.includes(p)))
    if (i >= 0 && !Object.values(map).includes(headers[i])) map[field] = headers[i]
  }

  guess('bib_number', ['bib', 'number', 'num', '#'])
  guess('first_name', ['first'])
  guess('last_name', ['last', 'surname'])
  guess('full_name', ['name', 'athlete', 'runner', 'full'])
  guess('team', ['team', 'club', 'school', 'org'])
  guess('division', ['division', 'category', 'class'])
  guess('age', ['age', 'dob', 'born'])
  guess('gender', ['gender', 'sex', 'm/f'])

  return map
}

function splitFullName(name = '') {
  const parts = name.trim().split(/\s+/)
  return { first_name: parts[0] ?? '', last_name: parts.slice(1).join(' ') }
}

function getDisplayName(entry) {
  if (!entry) return null

  const personName = `${entry.first_name ?? ''}${entry.last_name ? ` ${entry.last_name}` : ''}`.trim()
  if (personName) return personName

  if (entry.team) return entry.team

  return null
}

function isTeamOnlyEntry(entry) {
  if (!entry) return false
  const personName = `${entry.first_name ?? ''}${entry.last_name ? ` ${entry.last_name}` : ''}`.trim()
  return !personName && !!entry.team
}

// ── styles ─────────────────────────────────────────────────
const F = "'Barlow Condensed', sans-serif"
const FB = "'Barlow', sans-serif"

const S = {
  page: { minHeight: '100dvh', background: '#080b0f', color: '#e2e8f0', fontFamily: FB },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid #1a2030',
    background: '#0c1018',
    gap: 12,
    flexWrap: 'wrap',
  },
  backBtn: {
    background: 'none',
    border: '1px solid #1e2730',
    color: '#4a5568',
    borderRadius: 6,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: F,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  body: { maxWidth: 1100, margin: '0 auto', padding: '24px 20px 60px' },
  section: { marginBottom: 28 },
  sLabel: {
    fontSize: 10,
    color: '#4a5568',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 10,
    fontFamily: F,
    fontWeight: 700,
  },
  card: { background: '#0e1318', border: '1px solid #1a2030', borderRadius: 12, overflow: 'hidden' },
  statRow: { display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' },
  stat: {
    flex: 1,
    minWidth: 140,
    background: '#0e1318',
    border: '1px solid #1a2030',
    borderRadius: 10,
    padding: '14px 16px',
  },
  statVal: { fontSize: 28, fontWeight: 900, color: '#f1f5f9', lineHeight: 1, fontFamily: F },
  statLbl: { fontSize: 10, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: '#080b0f',
    border: '1px solid #1e2730',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 14,
    fontFamily: FB,
    outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '8px 10px',
    background: '#080b0f',
    border: '1px solid #1e2730',
    borderRadius: 6,
    color: '#e2e8f0',
    fontSize: 13,
    fontFamily: FB,
    outline: 'none',
  },
  addBtn: {
    background: '#1d4ed8',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    padding: '10px 20px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: FB,
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#374151',
    cursor: 'pointer',
    fontSize: 18,
    lineHeight: 1,
    padding: '0 4px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 14px',
    borderBottom: '1px solid #0d1117',
    fontSize: 13,
  },
  bibBadge: adhoc => ({
    width: 34,
    height: 34,
    background: adhoc ? '#0f1f3a' : '#1a2030',
    border: `1px solid ${adhoc ? '#3b82f6' : '#2a3444'}`,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
    color: adhoc ? '#60a5fa' : '#f97316',
    flexShrink: 0,
    fontFamily: F,
  }),
}

const adhocLabelStyle = {
  fontSize: 10,
  color: '#4a5568',
  display: 'block',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: 1,
  fontFamily: F,
  fontWeight: 700,
}

function CheckpointSetupRow({ checkpoint, onSave, onDelete, zebra }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(checkpoint.name)

  useEffect(() => {
    setName(checkpoint.name)
  }, [checkpoint.name])

  const commit = async () => {
    setEditing(false)
    const trimmed = name.trim()
    if (trimmed && trimmed !== checkpoint.name) {
      await onSave(checkpoint.id, trimmed)
    } else {
      setName(checkpoint.name)
    }
  }

  return (
    <div style={{ ...S.row, background: zebra ? '#0a0f16' : 'transparent' }}>
      <span style={{ width: 60, color: '#f97316', fontWeight: 700, fontFamily: F }}>
        CP {checkpoint.checkpoint_order}
      </span>

      <div style={{ flex: 1 }}>
        {editing ? (
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setName(checkpoint.name)
                setEditing(false)
              }
            }}
            autoFocus
            style={{ ...S.input, height: 34, padding: '6px 10px' }}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#e2e8f0',
              fontSize: 13,
              cursor: 'pointer',
              padding: 0,
              textAlign: 'left',
              fontFamily: FB,
            }}
            title="Click to rename"
          >
            {checkpoint.name}
          </button>
        )}
      </div>

      <span style={{ width: 90, color: '#4a5568', fontSize: 12 }}>
        {checkpoint.short_code ?? checkpoint.code ?? '—'}
      </span>

      <button style={S.removeBtn} onClick={() => onDelete(checkpoint.id)}>×</button>
    </div>
  )
}

function RaceControlPanel({
  event,
  eventId,
  startingRace,
  finishingRace,
  onStartRace,
  onFinishRace,
  navigate,
}) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (event?.status !== 'active' || !event?.race_started_at) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [event?.status, event?.race_started_at])

  const isActive = event?.status === 'active'
  const isFinished = event?.status === 'finished'
  const hasStarted = !!event?.race_started_at
  const elapsedMs = getRaceElapsedMs(event, now)

  const status = isActive
    ? { label: 'LIVE', color: '#ef4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.25)' }
    : isFinished
      ? { label: 'FINISHED', color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)' }
      : { label: 'NOT STARTED', color: '#eab308', bg: 'rgba(234,179,8,0.10)', border: 'rgba(234,179,8,0.25)' }

  return (
    <div style={{ ...S.card, padding: 18, marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ ...S.sLabel, marginBottom: 6 }}>Race Control</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 999,
                border: `1px solid ${status.border}`,
                background: status.bg,
                color: status.color,
                fontSize: 11,
                fontFamily: F,
                fontWeight: 800,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: status.color, display: 'inline-block' }} />
              {status.label}
            </span>

            {hasStarted && (
              <span style={{ color: '#4a5568', fontSize: 12 }}>
                Started {new Date(event.race_started_at).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'right', minWidth: 140 }}>
          <div style={{ fontSize: 10, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: F, fontWeight: 700, marginBottom: 4 }}>
            Race Clock
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, color: isActive ? '#f0f4f8' : '#374151', fontFamily: F, letterSpacing: -1.5, lineHeight: 1 }}>
            {formatRaceClock(elapsedMs)}
          </div>
        </div>
      </div>

      <div style={{ background: '#080b0f', border: '1px solid #1e2730', borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 4 }}>
          {isActive
            ? 'Race is live. Checkpoint timers are active and the public clock is running.'
            : isFinished
              ? 'Race is marked finished. Checkpoint capture should be stopped.'
              : 'Race has not started yet. Starting race activates checkpoint timers and the public live clock.'}
        </div>
        <div style={{ fontSize: 12, color: '#4a5568' }}>
          Use these controls carefully — they affect all timer devices and the public results site.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 10 }}>
        <button
          onClick={onStartRace}
          disabled={startingRace || isActive || isFinished}
          style={{
            height: 50,
            borderRadius: 10,
            border: 'none',
            background: startingRace || isActive || isFinished ? '#1e2730' : 'linear-gradient(135deg, #16a34a, #15803d)',
            color: '#fff',
            cursor: startingRace || isActive || isFinished ? 'not-allowed' : 'pointer',
            fontFamily: F,
            fontWeight: 900,
            fontSize: 15,
            letterSpacing: 2,
            textTransform: 'uppercase',
            opacity: startingRace || isActive || isFinished ? 0.6 : 1,
            boxShadow: startingRace || isActive || isFinished ? 'none' : '0 4px 18px rgba(22,163,74,0.25)',
          }}
        >
          {isActive ? 'Race Live' : isFinished ? 'Race Finished' : startingRace ? 'Starting…' : 'Start Race'}
        </button>

        <button
          onClick={onFinishRace}
          disabled={finishingRace || !isActive}
          style={{
            height: 50,
            borderRadius: 10,
            border: '1px solid rgba(239,68,68,0.35)',
            background: 'transparent',
            color: !isActive ? '#4b5563' : '#f87171',
            cursor: !isActive || finishingRace ? 'not-allowed' : 'pointer',
            fontFamily: F,
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            opacity: finishingRace ? 0.7 : 1,
          }}
        >
          {finishingRace ? 'Finishing…' : 'Finish Race'}
        </button>

        <button
          onClick={() => navigate(`/race/${eventId}/monitor`)}
          style={{
            height: 50,
            borderRadius: 10,
            border: '1px solid #1e2730',
            background: 'rgba(59,130,246,0.06)',
            color: '#60a5fa',
            cursor: 'pointer',
            fontFamily: F,
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
          }}
        >
          Monitor
        </button>

        <button
          onClick={() => navigate(`/race/${eventId}/checkpoints`)}
          style={{
            height: 50,
            borderRadius: 10,
            border: '1px solid #1e2730',
            background: 'rgba(249,115,22,0.06)',
            color: '#f97316',
            cursor: 'pointer',
            fontFamily: F,
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
          }}
        >
          Checkpoints
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <button
          onClick={() => navigate(`/results/${eventId}`)}
          style={{
            height: 44,
            borderRadius: 10,
            border: '1px solid #1e2730',
            background: 'transparent',
            color: '#60a5fa',
            cursor: 'pointer',
            fontFamily: F,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          Live Results ↗
        </button>

        <button
          onClick={() => navigate(`/race/${eventId}/checkpoint-qr`)}
          style={{
            height: 44,
            borderRadius: 10,
            border: '1px solid #1e2730',
            background: 'transparent',
            color: '#f97316',
            cursor: 'pointer',
            fontFamily: F,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          Print QR Sheet
        </button>
      </div>
    </div>
  )
}

function EditableCellInput({
  value,
  onChange,
  onSave,
  type = 'text',
  list,
  placeholder,
  width = '100%',
  lockedStyle = false,
  title,
}) {
  const [draft, setDraft] = useState(value ?? '')

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  const commit = () => {
    const normalized = type === 'number' ? (draft === '' ? '' : String(draft)) : draft
    const original = value ?? ''
    if (normalized !== original) onSave(draft)
  }

  return (
    <input
      type={type}
      value={draft}
      list={list}
      title={title}
      placeholder={placeholder}
      onChange={e => {
        setDraft(e.target.value)
        onChange?.(e.target.value)
      }}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          setDraft(value ?? '')
          e.currentTarget.blur()
        }
      }}
      style={{
        width,
        padding: '6px 8px',
        background: lockedStyle ? 'rgba(234,179,8,0.08)' : '#080b0f',
        border: lockedStyle ? '1px solid rgba(234,179,8,0.35)' : '1px solid #1e2730',
        borderRadius: 6,
        color: '#e2e8f0',
        fontSize: 12,
        fontFamily: FB,
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'border-color 0.15s ease, background 0.15s ease',
      }}
    />
  )
}

function RowSaveBadge({ state }) {
  if (!state || state === 'idle') return null

  const config =
    state === 'saving'
      ? { text: 'Saving…', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)' }
      : state === 'saved'
        ? { text: 'Saved', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)' }
        : { text: 'Error', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)' }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 62,
        height: 22,
        padding: '0 8px',
        borderRadius: 999,
        border: `1px solid ${config.border}`,
        background: config.bg,
        color: config.color,
        fontSize: 9,
        fontFamily: F,
        fontWeight: 800,
        letterSpacing: 1,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {config.text}
    </span>
  )
}

function EditableEntryRow({
  entry,
  zebra,
  onSaveField,
  onDelete,
  teamOptions,
  divisionOptions,
  genderOptions,
  saveState,
  isRaceLocked,
}) {
  const displayLabel = getDisplayName(entry)
  const showTeamBadge = isTeamOnlyEntry(entry)

  return (
    <div
      style={{
        ...S.row,
        background: zebra ? '#0a0f16' : 'transparent',
        alignItems: 'center',
      }}
    >
      <div style={{ width: 54 }}>
        <EditableCellInput
          value={entry.bib_number ?? ''}
          onSave={val => onSaveField(entry.id, 'bib_number', val.trim() || null)}
          placeholder="Bib"
          lockedStyle={isRaceLocked}
          title={
            isRaceLocked
              ? 'Race is active or finished. Changing bibs now can affect live splits and results.'
              : 'Bib number'
          }
        />
      </div>

      <div style={{ width: 120 }}>
        <EditableCellInput
          value={entry.first_name ?? ''}
          onSave={val => onSaveField(entry.id, 'first_name', val.trim() || null)}
          placeholder="First"
        />
      </div>

      <div style={{ width: 120 }}>
        <EditableCellInput
          value={entry.last_name ?? ''}
          onSave={val => onSaveField(entry.id, 'last_name', val.trim() || null)}
          placeholder="Last"
        />
      </div>

      <div style={{ width: 140 }}>
        <EditableSuggestInput
          value={entry.team ?? ''}
          options={teamOptions}
          onSave={val => onSaveField(entry.id, 'team', val)}
          placeholder="Team"
          title="Select an existing team or type a new one"
        />
      </div>

      <div style={{ width: 110 }}>
        <EditableSuggestInput
          value={entry.division ?? ''}
          options={divisionOptions}
          onSave={val => onSaveField(entry.id, 'division', val)}
          placeholder="Division"
          title="Select an existing division or type a new one"
        />
      </div>

      <div style={{ width: 60 }}>
        <EditableCellInput
          value={entry.age ?? ''}
          type="number"
          onSave={val => onSaveField(entry.id, 'age', val === '' ? null : parseInt(val, 10) || null)}
          placeholder="Age"
        />
      </div>

      <div style={{ width: 90 }}>
        <EditableSuggestInput
          value={entry.gender ?? ''}
          options={genderOptions}
          onSave={val => onSaveField(entry.id, 'gender', val)}
          placeholder="Gender"
          title="Select an existing gender value or type a new one"
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          {entry.is_adhoc && (
            <span
              style={{
                fontSize: 9,
                background: '#0f1f3a',
                color: '#60a5fa',
                padding: '1px 5px',
                borderRadius: 3,
                letterSpacing: 1,
              }}
            >
              DAY-OF
            </span>
          )}

          {showTeamBadge && (
            <span
              style={{
                fontSize: 9,
                background: 'rgba(249,115,22,0.10)',
                color: '#f97316',
                padding: '1px 6px',
                borderRadius: 999,
                letterSpacing: 1,
                border: '1px solid rgba(249,115,22,0.25)',
                fontFamily: F,
                fontWeight: 800,
                textTransform: 'uppercase',
              }}
              title={displayLabel || 'Team entry'}
            >
              Team Entry
            </span>
          )}

          <RowSaveBadge state={saveState} />
        </div>
      </div>

      <button style={S.removeBtn} onClick={() => onDelete(entry.id)}>×</button>
    </div>
  )
}

function EditableSuggestInput({
  value,
  options = [],
  onSave,
  placeholder,
  width = '100%',
  title,
}) {
  const [draft, setDraft] = useState(value ?? '')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  const filtered = options.filter(opt =>
    String(opt).toLowerCase().includes(String(draft ?? '').toLowerCase())
  )

  const commit = nextValue => {
    const finalValue = nextValue ?? draft
    const normalized = finalValue?.trim?.() ?? ''
    const original = value ?? ''
    if (normalized !== original) {
      onSave(normalized || null)
    }
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative', width }}>
      <input
        value={draft}
        title={title}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={e => {
          setDraft(e.target.value)
          setOpen(true)
        }}
        onBlur={() => {
          setTimeout(() => {
            commit()
          }, 120)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
            e.currentTarget.blur()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(value ?? '')
            setOpen(false)
            e.currentTarget.blur()
          }
          if (e.key === 'ArrowDown') {
            setOpen(true)
          }
        }}
        style={{
          width: '100%',
          padding: '6px 8px',
          background: '#080b0f',
          border: '1px solid #1e2730',
          borderRadius: 6,
          color: '#e2e8f0',
          fontSize: 12,
          fontFamily: FB,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />

      {open && filtered.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#0e1318',
            border: '1px solid #1e2730',
            borderRadius: 8,
            boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
            zIndex: 20,
            maxHeight: 180,
            overflowY: 'auto',
          }}
        >
          {filtered.slice(0, 12).map(opt => (
            <button
              key={opt}
              type="button"
              onMouseDown={e => {
                e.preventDefault()
                setDraft(opt)
                commit(opt)
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid #141920',
                color: '#e2e8f0',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: FB,
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PreRaceSetup() {
  const { id: eventId } = useParams()
  const navigate = useNavigate()

  const [event, setEvent] = useState(null)
  const [entries, setEntries] = useState([])
  const [checkpoints, setCheckpoints] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingCheckpoint, setSavingCheckpoint] = useState(false)
  const [startingRace, setStartingRace] = useState(false)
  const [finishingRace, setFinishingRace] = useState(false)
  const [checkpointName, setCheckpointName] = useState('')
  const [saveStateByEntryId, setSaveStateByEntryId] = useState({})

  const [csvStep, setCsvStep] = useState('idle')
  const [csvData, setCsvData] = useState(null)
  const [mapping, setMapping] = useState({})
  const [csvError, setCsvError] = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef()

  const [showAdHoc, setShowAdHoc] = useState(false)
  const [form, setForm] = useState({
    bib_number: '',
    first_name: '',
    last_name: '',
    team: '',
    division: '',
    age: '',
    gender: '',
  })
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!eventId) return
    Promise.all([
      supabase.from('race_events').select('*').eq('id', eventId).single(),
      supabase.from('event_entries').select('*').eq('event_id', eventId).order('bib_number'),
      supabase.from('race_checkpoints').select('*').eq('event_id', eventId).order('checkpoint_order'),
    ]).then(([{ data: ev }, { data: ent }, { data: cps }]) => {
      setEvent(ev)
      setEntries(ent ?? [])
      setCheckpoints(cps ?? [])
      setLoading(false)
    })
  }, [eventId])

  const teamOptions = useMemo(() => {
    return Array.from(new Set(entries.map(e => e.team).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [entries])

  const divisionOptions = useMemo(() => {
    return Array.from(new Set(entries.map(e => e.division).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [entries])

  const genderOptions = useMemo(() => {
    const base = ['M', 'F', 'NB', 'Non-Binary', 'Open']
    const existing = entries.map(e => e.gender).filter(Boolean)
    return Array.from(new Set([...base, ...existing]))
  }, [entries])

  const loadCheckpoints = async () => {
    const { data } = await supabase
      .from('race_checkpoints')
      .select('*')
      .eq('event_id', eventId)
      .order('checkpoint_order')
    setCheckpoints(data ?? [])
  }

  const addCheckpoint = async () => {
    const name = checkpointName.trim()
    if (!name || savingCheckpoint) return

    setSavingCheckpoint(true)
    const nextOrder =
      checkpoints.length > 0
        ? Math.max(...checkpoints.map(c => c.checkpoint_order)) + 1
        : 1

    const shortCode = `CP${nextOrder}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

    const { error } = await supabase.from('race_checkpoints').insert({
      event_id: eventId,
      name,
      checkpoint_order: nextOrder,
      code: `CP${nextOrder}`,
      short_code: shortCode,
      is_active: true,
    })

    setSavingCheckpoint(false)
    if (!error) {
      setCheckpointName('')
      loadCheckpoints()
    }
  }

  const updateCheckpointName = async (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    await supabase.from('race_checkpoints').update({ name: trimmed }).eq('id', id)
    loadCheckpoints()
  }

  const deleteCheckpoint = async id => {
    const ok = window.confirm('Delete this checkpoint?')
    if (!ok) return
    await supabase.from('race_checkpoints').delete().eq('id', id)
    loadCheckpoints()
  }

  const seedEightCheckpoints = async () => {
    if (savingCheckpoint) return
    if (checkpoints.length > 0) {
      const ok = window.confirm('Checkpoints already exist. Add missing checkpoints up to 8?')
      if (!ok) return
    }

    setSavingCheckpoint(true)
    const existingOrders = new Set(checkpoints.map(c => c.checkpoint_order))
    const rows = []

    for (let i = 1; i <= 8; i++) {
      if (!existingOrders.has(i)) {
        rows.push({
          event_id: eventId,
          name: `Checkpoint ${i}`,
          checkpoint_order: i,
          code: `CP${i}`,
          short_code: `CP${i}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          is_active: true,
        })
      }
    }

    if (rows.length) await supabase.from('race_checkpoints').insert(rows)
    setSavingCheckpoint(false)
    loadCheckpoints()
  }

  const startRace = async () => {
    if (startingRace) return

    if (event?.status === 'active') {
      window.alert('Race is already active.')
      return
    }

    if (event?.status === 'finished') {
      window.alert('Race is already finished. Reopening/resetting should be a separate admin action.')
      return
    }

    const ok = window.confirm(
      'Start race now?\n\nThis will activate all checkpoint timers and begin the public live clock.'
    )
    if (!ok) return

    setStartingRace(true)
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('race_events')
      .update({
        race_started_at: now,
        race_finished_at: null,
        status: 'active',
      })
      .eq('id', eventId)
      .select()
      .single()

    setStartingRace(false)

    if (!error && data) {
      setEvent(data)
      navigate(`/race/${eventId}/monitor`)
    }
  }

  const finishRace = async () => {
    if (finishingRace) return

    if (event?.status !== 'active') {
      window.alert('Race must be active before it can be finished.')
      return
    }

    const ok = window.confirm(
      'Mark race as finished?\n\nThis will stop checkpoint lap capture for timer devices.'
    )
    if (!ok) return

    setFinishingRace(true)

    const finishedAt = new Date().toISOString()

    const { data, error } = await supabase
      .from('race_events')
      .update({
        status: 'finished',
        race_finished_at: finishedAt,
      })
      .eq('id', eventId)
      .select()
      .single()

    setFinishingRace(false)

    if (error) {
      console.error('finishRace error:', error)
      window.alert(`Could not finish race: ${error.message}`)
      return
    }

    if (!data) {
      window.alert('Could not finish race: no row returned.')
      return
    }

    setEvent(data)
  }

  const handleFile = e => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => processText(ev.target.result)
    reader.readAsText(file)
  }

  const handlePaste = e => {
    const text = e.clipboardData.getData('text')
    if (text) processText(text)
  }

  const processText = text => {
    setCsvError('')
    const parsed = parseCSV(text)
    if (!parsed.headers.length) {
      setCsvError('Could not parse — make sure it has a header row.')
      return
    }
    setCsvData(parsed)
    setMapping(autoMap(parsed.headers))
    setCsvStep('mapping')
  }

  const importCSV = async () => {
    setCsvError('')

    if (!mapping.bib_number) {
      setCsvError('Bib # column is required.')
      return
    }

    const hasNameMapping = !!(mapping.first_name || mapping.last_name || mapping.full_name)
    const hasTeamMapping = !!mapping.team

    if (!hasNameMapping && !hasTeamMapping) {
      setCsvError('Need at least a Team column or a Name column (First Name, Last Name, or Full Name).')
      return
    }

    setImporting(true)
    const toInsert = []

    for (const row of csvData.rows) {
      const get = field => {
        const col = mapping[field]
        if (!col) return ''
        const idx = csvData.headers.indexOf(col)
        return idx >= 0 ? (row[idx] ?? '').trim() : ''
      }

      const bib = get('bib_number')
      if (!bib) continue

      let first = get('first_name')
      let last = get('last_name')
      const team = get('team') || null

      if (!first && !last && mapping.full_name) {
        const split = splitFullName(get('full_name'))
        first = split.first_name
        last = split.last_name
      }

      const hasPersonName = !!(first || last)

      if (!hasPersonName && !team) continue

      toInsert.push({
        event_id: eventId,
        bib_number: bib,
        first_name: first || null,
        last_name: last || null,
        team,
        division: get('division') || null,
        age: get('age') ? parseInt(get('age'), 10) || null : null,
        gender: get('gender') || null,
        is_adhoc: false,
      })
    }

    if (!toInsert.length) {
      setCsvError('No valid rows to import.')
      setImporting(false)
      return
    }

    const { data, error } = await supabase.from('event_entries').insert(toInsert).select()
    setImporting(false)

    if (error) {
      setCsvError(error.message)
      return
    }

    setEntries(prev =>
      [...prev, ...(data || [])].sort((a, b) =>
        String(a.bib_number).localeCompare(String(b.bib_number), undefined, { numeric: true })
      )
    )

    setCsvStep('idle')
    setCsvData(null)
    setMapping({})
  }

  const addAdHoc = async () => {
    setFormError('')

    if (!form.bib_number.trim()) {
      setFormError('Bib number is required.')
      return
    }

    if (!form.first_name.trim() && !form.team.trim()) {
      setFormError('Either First name or Team is required.')
      return
    }

    setSaving(true)

    const { data, error } = await supabase
      .from('event_entries')
      .insert({
        event_id: eventId,
        bib_number: form.bib_number.trim(),
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        team: form.team.trim() || null,
        division: form.division.trim() || null,
        age: form.age ? parseInt(form.age, 10) : null,
        gender: form.gender.trim() || null,
        is_adhoc: true,
      })
      .select()
      .single()

    setSaving(false)

    if (error) {
      setFormError(error.message)
      return
    }

    setEntries(prev =>
      [...prev, data].sort((a, b) =>
        String(a.bib_number).localeCompare(String(b.bib_number), undefined, { numeric: true })
      )
    )

    setForm({
      bib_number: '',
      first_name: '',
      last_name: '',
      team: '',
      division: '',
      age: '',
      gender: '',
    })
    setShowAdHoc(false)
  }

  const saveEntryField = async (entryId, field, value) => {
    const existing = entries.find(e => e.id === entryId)
    if (!existing) return

    const currentValue = existing[field] ?? null
    const nextValue = value ?? null

    if (currentValue === nextValue) return

    if (field === 'bib_number' && event?.status !== 'draft') {
      const ok = window.confirm(
        `Change bib from "${currentValue ?? ''}" to "${nextValue ?? ''}"?\n\nThis race is already started or finished. Changing bibs after timing begins can make live splits and results inconsistent.`
      )
      if (!ok) return
    }

    setSaveStateByEntryId(prev => ({ ...prev, [entryId]: 'saving' }))

    const { data, error } = await supabase
      .from('event_entries')
      .update({ [field]: nextValue })
      .eq('id', entryId)
      .select()
      .single()

    if (error || !data) {
      setSaveStateByEntryId(prev => ({ ...prev, [entryId]: 'error' }))
      setTimeout(() => {
        setSaveStateByEntryId(prev => ({ ...prev, [entryId]: 'idle' }))
      }, 2000)
      return
    }

    setEntries(prev =>
      prev
        .map(e => (e.id === entryId ? data : e))
        .sort((a, b) =>
          String(a.bib_number).localeCompare(String(b.bib_number), undefined, { numeric: true })
        )
    )

    setSaveStateByEntryId(prev => ({ ...prev, [entryId]: 'saved' }))
    setTimeout(() => {
      setSaveStateByEntryId(prev => ({ ...prev, [entryId]: 'idle' }))
    }, 1200)
  }

  const removeEntry = async id => {
    await supabase.from('event_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const preloaded = entries.filter(e => !e.is_adhoc)
  const adhoc = entries.filter(e => e.is_adhoc)

  if (loading) {
    return (
      <div style={{ ...S.page, alignItems: 'center', justifyContent: 'center', display: 'flex', color: '#4a5568' }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />

      <div style={S.header}>
        <button style={S.backBtn} onClick={() => navigate('/')}>← Events</button>

        <div style={{ flex: 1, padding: '0 16px', minWidth: 220 }}>
          <div style={{ fontSize: 11, color: '#f97316', letterSpacing: 2, fontFamily: F, fontWeight: 700 }}>
            PRE-RACE SETUP
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', fontFamily: F }}>
            {event?.name}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            style={{ ...S.backBtn, color: '#60a5fa' }}
            onClick={() => navigate(`/results/${eventId}`)}
          >
            Live Results ↗
          </button>

          <button
            style={{ ...S.backBtn, color: '#a78bfa' }}
            onClick={() => navigate(`/race/${eventId}/corrections`)}
          >
            Corrections
          </button>

          <button
            style={{ ...S.backBtn, color: '#f97316' }}
            onClick={() => navigate(`/race/${eventId}/checkpoints`)}
          >
            Checkpoints
          </button>

          <button
            style={{ ...S.backBtn, color: '#3b82f6' }}
            onClick={() => navigate(`/race/${eventId}/monitor`)}
          >
            Monitor
          </button>
        </div>
      </div>

      <div style={S.body}>
        <div style={S.statRow}>
          {[
            { label: 'Total Entries', value: entries.length },
            { label: 'Pre-registered', value: preloaded.length },
            { label: 'Day-of', value: adhoc.length },
            { label: 'Checkpoints', value: checkpoints.length },
          ].map(s => (
            <div key={s.label} style={S.stat}>
              <div style={S.statVal}>{s.value}</div>
              <div style={S.statLbl}>{s.label}</div>
            </div>
          ))}
        </div>

        <RaceControlPanel
          event={event}
          eventId={eventId}
          startingRace={startingRace}
          finishingRace={finishingRace}
          onStartRace={startRace}
          onFinishRace={finishRace}
          navigate={navigate}
        />

        <div style={S.section}>
          <div style={S.sLabel}>Import Athletes / Teams</div>

          {csvStep === 'idle' && (
            <div style={{ ...S.card, padding: 20 }}>
              <div
                onPaste={handlePaste}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const f = e.dataTransfer.files[0]
                  if (f) {
                    const r = new FileReader()
                    r.onload = ev => processText(ev.target.result)
                    r.readAsText(f)
                  }
                }}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: '2px dashed #1e2730',
                  borderRadius: 10,
                  padding: '32px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                  Drop CSV file, click to browse, or paste data
                </div>
                <div style={{ color: '#4a5568', fontSize: 12 }}>
                  Supports CSV, TSV, or paste from Excel/Google Sheets
                </div>
                <div style={{ color: '#4a5568', fontSize: 11, marginTop: 6 }}>
                  For relay imports, Bib + Team is enough. Athlete names are optional.
                </div>
                <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" style={{ display: 'none' }} onChange={handleFile} />
              </div>

              {csvError && <div style={{ color: '#f87171', fontSize: 12, marginTop: 10 }}>{csvError}</div>}
            </div>
          )}

          {csvStep === 'mapping' && csvData && (
            <div style={{ ...S.card, padding: 20 }}>
              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
                Found <strong style={{ color: '#f1f5f9' }}>{csvData.rows.length} rows</strong> with <strong style={{ color: '#f1f5f9' }}>{csvData.headers.length} columns</strong>. Map each column to a field:
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                {Object.keys(FIELD_LABELS).filter(f => f !== 'skip').map(field => (
                  <div key={field}>
                    <label style={{ fontSize: 10, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4, fontFamily: F, fontWeight: 700 }}>
                      {FIELD_LABELS[field]}{field === 'bib_number' ? ' *' : ''}
                    </label>
                    <select
                      value={mapping[field] ?? ''}
                      onChange={e => setMapping(p => ({ ...p, [field]: e.target.value || undefined }))}
                      style={S.select}
                    >
                      <option value="">— Skip —</option>
                      {csvData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 10, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: F, fontWeight: 700 }}>
                Preview (first 3 rows)
              </div>

              <div style={{ background: '#080b0f', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                {csvData.rows.slice(0, 3).map((row, i) => {
                  const get = field => {
                    const col = mapping[field]
                    if (!col) return '—'
                    const idx = csvData.headers.indexOf(col)
                    return idx >= 0 ? row[idx] || '—' : '—'
                  }
                  const personName = mapping.first_name
                    ? `${get('first_name')} ${get('last_name')}`.trim()
                    : get('full_name')

                  const name = personName || get('team') || '—'
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 12px', borderBottom: '1px solid #0d1117', fontSize: 12, alignItems: 'center' }}>
                      <span style={{ color: '#f97316', fontWeight: 700, width: 36, fontFamily: F }}>{get('bib_number')}</span>
                      <span style={{ color: '#e2e8f0', flex: 1 }}>{name}</span>
                      <span style={{ color: '#4a5568' }}>{get('team')}</span>
                      <span style={{ color: '#4a5568' }}>{get('division')}</span>
                      <span style={{ color: '#4a5568', width: 24 }}>{get('age')}</span>
                      <span style={{ color: '#4a5568', width: 40 }}>{get('gender')}</span>
                    </div>
                  )
                })}
              </div>

              {csvError && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>{csvError}</div>}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={importCSV} disabled={importing} style={{ ...S.addBtn, flex: 1, opacity: importing ? 0.6 : 1 }}>
                  {importing ? 'Importing…' : `Import ${csvData.rows.length} Rows`}
                </button>
                <button onClick={() => { setCsvStep('idle'); setCsvData(null); setCsvError('') }} style={{ ...S.backBtn }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={S.section}>
          <div style={S.sLabel}>Checkpoints</div>
          <div style={{ ...S.card, padding: 18 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <input
                value={checkpointName}
                onChange={e => setCheckpointName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCheckpoint()}
                placeholder="Add checkpoint name"
                style={{ ...S.input, flex: 1, minWidth: 220 }}
              />
              <button
                onClick={addCheckpoint}
                disabled={!checkpointName.trim() || savingCheckpoint}
                style={{ ...S.addBtn, opacity: !checkpointName.trim() || savingCheckpoint ? 0.5 : 1 }}
              >
                {savingCheckpoint ? 'Saving…' : 'Add'}
              </button>
              <button
                onClick={seedEightCheckpoints}
                disabled={savingCheckpoint}
                style={{ ...S.backBtn, color: '#60a5fa' }}
              >
                Seed 8
              </button>
            </div>

            {checkpoints.length === 0 ? (
              <div style={{ color: '#4a5568', fontSize: 13 }}>
                No checkpoints yet. Add them manually or use “Seed 8”.
              </div>
            ) : (
              <div style={{ background: '#080b0f', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 10, padding: '6px 14px', borderBottom: '1px solid #1a2030', fontSize: 10, color: '#374151', textTransform: 'uppercase', letterSpacing: 1, fontFamily: F, fontWeight: 700 }}>
                  <span style={{ width: 60 }}>Order</span>
                  <span style={{ flex: 1 }}>Name</span>
                  <span style={{ width: 90 }}>Quick Code</span>
                  <span style={{ width: 30 }}></span>
                </div>

                {checkpoints.map((cp, i) => (
                  <CheckpointSetupRow
                    key={cp.id}
                    checkpoint={cp}
                    onSave={updateCheckpointName}
                    onDelete={deleteCheckpoint}
                    zebra={i % 2 === 1}
                  />
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={() => navigate(`/race/${eventId}/checkpoints`)} style={{ ...S.addBtn, flex: 1 }}>
                Open Checkpoints
              </button>
              <button onClick={() => navigate(`/results/${eventId}`)} style={{ ...S.backBtn, flex: 1, color: '#60a5fa' }}>
                View Live Results
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => exportRawLapEvents(eventId)}
                style={{ ...S.backBtn, flex: 1, color: '#60a5fa' }}
              >
                Export Raw Lap CSV
              </button>

              <button
                onClick={() => exportLapSummary(eventId)}
                style={{ ...S.backBtn, flex: 1, color: '#60a5fa' }}
              >
                Export Lap Summary CSV
              </button>
            </div>
          </div>
        </div>

        {entries.length > 0 && (
          <div style={S.section}>
            <div style={S.sLabel}>Roster ({entries.length})</div>

            {event?.status !== 'draft' && (
              <div
                style={{
                  marginBottom: 10,
                  color: '#eab308',
                  fontSize: 12,
                  fontFamily: FB,
                }}
              >
                Bib edits are sensitive once the race has started. Team, division, gender, and names can still be corrected inline.
              </div>
            )}

            <div style={{ ...S.card, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 860 }}>
                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      padding: '6px 14px',
                      borderBottom: '1px solid #1a2030',
                      fontSize: 10,
                      color: '#374151',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      fontFamily: F,
                      fontWeight: 700,
                      alignItems: 'center',
                      position: 'sticky',
                      top: 0,
                      zIndex: 2,
                      background: '#0e1318',
                      boxShadow: '0 2px 0 rgba(0,0,0,0.2)',
                    }}
                  >
                    <span style={{ width: 54, color: event?.status !== 'draft' ? '#eab308' : '#374151' }}>
                      Bib
                    </span>
                    <span style={{ width: 120 }}>First</span>
                    <span style={{ width: 120 }}>Last</span>
                    <span style={{ width: 140 }}>Team</span>
                    <span style={{ width: 110 }}>Division</span>
                    <span style={{ width: 60 }}>Age</span>
                    <span style={{ width: 90 }}>Gender</span>
                    <span style={{ flex: 1 }}></span>
                    <span style={{ width: 24 }}></span>
                  </div>

                  <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                    {entries.map((entry, i) => (
                      <EditableEntryRow
                        key={entry.id}
                        entry={entry}
                        zebra={i % 2 === 1}
                        onSaveField={saveEntryField}
                        onDelete={removeEntry}
                        teamOptions={teamOptions}
                        divisionOptions={divisionOptions}
                        genderOptions={genderOptions}
                        saveState={saveStateByEntryId[entry.id] || 'idle'}
                        isRaceLocked={event?.status !== 'draft'}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {showAdHoc ? (
          <div style={{ ...S.card, padding: 18, marginBottom: 24 }}>
            <div style={{ ...S.sLabel, marginBottom: 12 }}>Add Day-Of Competitor / Team</div>

            {formError && (
              <div style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>
                {formError}
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 1fr',
                gap: 10,
              }}
            >
              <div>
                <label style={adhocLabelStyle}>Bib # *</label>
                <input
                  value={form.bib_number}
                  onChange={e => setForm(p => ({ ...p, bib_number: e.target.value }))}
                  style={S.input}
                />
              </div>

              <div>
                <label style={adhocLabelStyle}>First Name</label>
                <input
                  value={form.first_name}
                  onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))}
                  style={S.input}
                />
              </div>

              <div>
                <label style={adhocLabelStyle}>Last Name</label>
                <input
                  value={form.last_name}
                  onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))}
                  style={S.input}
                />
              </div>

              <div>
                <label style={adhocLabelStyle}>Age</label>
                <input
                  type="number"
                  value={form.age}
                  onChange={e => setForm(p => ({ ...p, age: e.target.value }))}
                  style={S.input}
                />
              </div>

              <div>
                <label style={adhocLabelStyle}>Team</label>
                <input
                  list="adhoc-team-options"
                  value={form.team}
                  onChange={e => setForm(p => ({ ...p, team: e.target.value }))}
                  style={S.input}
                />
              </div>

              <div>
                <label style={adhocLabelStyle}>Division</label>
                <input
                  list="adhoc-division-options"
                  value={form.division}
                  onChange={e => setForm(p => ({ ...p, division: e.target.value }))}
                  style={S.input}
                />
              </div>

              <div>
                <label style={adhocLabelStyle}>Gender</label>
                <input
                  list="adhoc-gender-options"
                  value={form.gender}
                  onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}
                  style={S.input}
                />
              </div>
            </div>

            <datalist id="adhoc-team-options">
              {teamOptions.map(v => <option key={v} value={v} />)}
            </datalist>

            <datalist id="adhoc-division-options">
              {divisionOptions.map(v => <option key={v} value={v} />)}
            </datalist>

            <datalist id="adhoc-gender-options">
              {genderOptions.map(v => <option key={v} value={v} />)}
            </datalist>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                onClick={addAdHoc}
                disabled={saving}
                style={{ ...S.addBtn, flex: 1, opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Adding…' : 'Add Entry'}
              </button>

              <button
                onClick={() => {
                  setShowAdHoc(false)
                  setFormError('')
                  setForm({
                    bib_number: '',
                    first_name: '',
                    last_name: '',
                    team: '',
                    division: '',
                    age: '',
                    gender: '',
                  })
                }}
                style={{ ...S.backBtn }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAdHoc(true)}
            style={{
              width: '100%',
              padding: 14,
              background: '#0e1318',
              border: '1px dashed #1e2730',
              borderRadius: 10,
              color: '#60a5fa',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: FB,
              marginBottom: 24,
            }}
          >
            + Add Day-Of Competitor / Team
          </button>
        )}

        {entries.length === 0 && (
          <p style={{ textAlign: 'center', color: '#374151', fontSize: 12, marginTop: 10 }}>
            No roster loaded — you can still capture laps and assign bibs manually
          </p>
        )}
      </div>

      <style>{`
        input:focus, select:focus, textarea:focus { border-color: #f97316 !important; outline: none; }
        input::placeholder { color: #2d3748; }
      `}</style>
    </div>
  )
}