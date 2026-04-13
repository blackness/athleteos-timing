/**
 * PreRaceSetup.jsx
 *
 * Route: /race/:id/setup
 * Replace existing RaceSetup.jsx with this file.
 *
 * Features:
 *  - CSV / paste upload with flexible column mapping
 *  - Auto-detect common column names
 *  - Ad-hoc runner form
 *  - Confirm roster and launch race
 */

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
  last_name:  'Last Name',
  full_name:  'Full Name',
  team:       'Team / Club',
  age:        'Age',
  gender:     'Gender',
  skip:       '— Skip —',
}

// Auto-guess mappings from header names
function autoMap(headers) {
  const map = {}
  const lower = headers.map(h => h.toLowerCase())
  const guess = (field, patterns) => {
    const i = lower.findIndex(h => patterns.some(p => h.includes(p)))
    if (i >= 0 && !Object.values(map).includes(headers[i])) map[field] = headers[i]
  }
  guess('bib_number', ['bib', 'number', 'num', '#'])
  guess('first_name', ['first'])
  guess('last_name',  ['last', 'surname'])
  guess('full_name',  ['name', 'athlete', 'runner', 'full'])
  guess('team',       ['team', 'club', 'school', 'org'])
  guess('age',        ['age', 'dob', 'born'])
  guess('gender',     ['gender', 'sex', 'm/f'])
  return map
}

function splitFullName(name = '') {
  const parts = name.trim().split(/\s+/)
  return { first_name: parts[0] ?? '', last_name: parts.slice(1).join(' ') }
}

// ── styles ─────────────────────────────────────────────────
const F = "'Barlow Condensed', sans-serif"
const FB = "'Barlow', sans-serif"

const S = {
  page: { minHeight: '100dvh', background: '#080b0f', color: '#e2e8f0', fontFamily: FB },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px', borderBottom: '1px solid #1a2030',
    background: '#0c1018',
  },
  backBtn: { background: 'none', border: '1px solid #1e2730', color: '#4a5568', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontFamily: F, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' },
  startBtn: { background: '#16a34a', border: 'none', borderRadius: 8, color: '#fff', padding: '10px 28px', fontSize: 15, fontWeight: 900, cursor: 'pointer', fontFamily: F, letterSpacing: 2, textTransform: 'uppercase' },
  body: { maxWidth: 720, margin: '0 auto', padding: '24px 20px 60px' },
  section: { marginBottom: 28 },
  sLabel: { fontSize: 10, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10, fontFamily: F, fontWeight: 700 },
  card: { background: '#0e1318', border: '1px solid #1a2030', borderRadius: 12, overflow: 'hidden' },
  statRow: { display: 'flex', gap: 12, marginBottom: 24 },
  stat: { flex: 1, background: '#0e1318', border: '1px solid #1a2030', borderRadius: 10, padding: '14px 16px' },
  statVal: { fontSize: 28, fontWeight: 900, color: '#f1f5f9', lineHeight: 1, fontFamily: F },
  statLbl: { fontSize: 10, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 },
  input: { width: '100%', padding: '10px 14px', background: '#080b0f', border: '1px solid #1e2730', borderRadius: 8, color: '#e2e8f0', fontSize: 14, fontFamily: FB, outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', padding: '8px 10px', background: '#080b0f', border: '1px solid #1e2730', borderRadius: 6, color: '#e2e8f0', fontSize: 13, fontFamily: FB, outline: 'none' },
  addBtn: { background: '#1d4ed8', border: 'none', borderRadius: 8, color: '#fff', padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FB },
  removeBtn: { background: 'none', border: 'none', color: '#374151', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #0d1117', fontSize: 13 },
  bibBadge: (adhoc) => ({
    width: 34, height: 34, background: adhoc ? '#0f1f3a' : '#1a2030',
    border: `1px solid ${adhoc ? '#3b82f6' : '#2a3444'}`,
    borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, color: adhoc ? '#60a5fa' : '#f97316', flexShrink: 0,
    fontFamily: F,
  }),
}

// ── component ──────────────────────────────────────────────
export default function PreRaceSetup() {
  const { id: eventId } = useParams()
  const navigate = useNavigate()

  const [event, setEvent]     = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  // CSV state
  const [csvStep, setCsvStep]     = useState('idle') // idle | mapping | preview
  const [csvData, setCsvData]     = useState(null)   // { headers, rows }
  const [mapping, setMapping]     = useState({})
  const [csvError, setCsvError]   = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef()

  // Ad-hoc form
  const [showAdHoc, setShowAdHoc] = useState(false)
  const [form, setForm] = useState({ bib_number: '', first_name: '', last_name: '', team: '', age: '', gender: '' })
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!eventId) return
    Promise.all([
      supabase.from('race_events').select('*').eq('id', eventId).single(),
      supabase.from('event_entries').select('*').eq('event_id', eventId).order('bib_number'),
    ]).then(([{ data: ev }, { data: ent }]) => {
      setEvent(ev)
      setEntries(ent ?? [])
      setLoading(false)
    })
  }, [eventId])

  // ── CSV upload ────────────────────────────────────────────
  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => processText(ev.target.result)
    reader.readAsText(file)
  }

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text')
    if (text) processText(text)
  }

  const processText = (text) => {
    setCsvError('')
    const parsed = parseCSV(text)
    if (!parsed.headers.length) { setCsvError('Could not parse — make sure it has a header row.'); return }
    setCsvData(parsed)
    setMapping(autoMap(parsed.headers))
    setCsvStep('mapping')
  }

  const importCSV = async () => {
    setCsvError('')
    if (!mapping.bib_number) { setCsvError('Bib # column is required.'); return }
    if (!mapping.first_name && !mapping.last_name && !mapping.full_name) {
      setCsvError('Need at least a name column (First Name, Last Name, or Full Name).'); return
    }

    setImporting(true)
    const toInsert = []
    const existingBibs = new Set(entries.map(e => e.bib_number))

    for (const row of csvData.rows) {
      const get = (field) => {
        const col = mapping[field]
        if (!col) return ''
        const idx = csvData.headers.indexOf(col)
        return idx >= 0 ? (row[idx] ?? '').trim() : ''
      }

      const bib = get('bib_number')
      if (!bib || existingBibs.has(bib)) continue

      let first = get('first_name')
      let last  = get('last_name')
      if (!first && !last && mapping.full_name) {
        const split = splitFullName(get('full_name'))
        first = split.first_name; last = split.last_name
      }
      if (!first && !last) continue

      toInsert.push({
        event_id: eventId, bib_number: bib,
        first_name: first || last, last_name: last || '',
        team: get('team') || null,
        age: get('age') ? parseInt(get('age')) || null : null,
        gender: get('gender') || null,
        is_adhoc: false,
      })
      existingBibs.add(bib)
    }

    if (!toInsert.length) { setCsvError('No new rows to import (all bibs already exist).'); setImporting(false); return }

    const { data, error } = await supabase.from('event_entries').insert(toInsert).select()
    setImporting(false)
    if (error) { setCsvError(error.message); return }
    setEntries(prev => [...prev, ...data].sort((a, b) => a.bib_number.localeCompare(b.bib_number, undefined, { numeric: true })))
    setCsvStep('idle')
    setCsvData(null)
    setMapping({})
  }

  // ── Ad-hoc ────────────────────────────────────────────────
  const addAdHoc = async () => {
    setFormError('')
    if (!form.bib_number.trim()) { setFormError('Bib number is required.'); return }
    if (!form.first_name.trim()) { setFormError('First name is required.'); return }
    if (entries.find(e => e.bib_number === form.bib_number.trim())) {
      setFormError(`Bib ${form.bib_number.trim()} already exists in this event.`); return
    }
    setSaving(true)
    const { data, error } = await supabase.from('event_entries').insert({
      event_id: eventId,
      bib_number: form.bib_number.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      team: form.team.trim() || null,
      age: form.age ? parseInt(form.age) : null,
      gender: form.gender || null,
      is_adhoc: true,
    }).select().single()
    setSaving(false)
    if (error) { setFormError(error.message); return }
    setEntries(prev => [...prev, data].sort((a, b) => a.bib_number.localeCompare(b.bib_number, undefined, { numeric: true })))
    setForm({ bib_number: '', first_name: '', last_name: '', team: '', age: '', gender: '' })
    setShowAdHoc(false)
  }

  const removeEntry = async (id) => {
    await supabase.from('event_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const preloaded = entries.filter(e => !e.is_adhoc)
  const adhoc     = entries.filter(e => e.is_adhoc)

  if (loading) return <div style={{ ...S.page, alignItems: 'center', justifyContent: 'center', display: 'flex', color: '#4a5568' }}>Loading…</div>

  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={() => navigate('/')}>← Events</button>
        <div style={{ flex: 1, padding: '0 16px' }}>
          <div style={{ fontSize: 11, color: '#f97316', letterSpacing: 2, fontFamily: F, fontWeight: 700 }}>PRE-RACE SETUP</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', fontFamily: F }}>{event?.name}</div>
        </div>
        <button
          style={{ ...S.startBtn, opacity: entries.length === 0 ? 0.5 : 1 }}
          onClick={() => navigate(`/race/${eventId}/time`)}
        >
          Start Race ▶
        </button>
      </div>

      <div style={S.body}>
        {/* Stats */}
        <div style={S.statRow}>
          {[
            { label: 'Total Athletes', value: entries.length },
            { label: 'Pre-registered', value: preloaded.length },
            { label: 'Day-of', value: adhoc.length },
          ].map(s => (
            <div key={s.label} style={S.stat}>
              <div style={S.statVal}>{s.value}</div>
              <div style={S.statLbl}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* CSV Import */}
        <div style={S.section}>
          <div style={S.sLabel}>Import Athletes</div>

          {csvStep === 'idle' && (
            <div style={{ ...S.card, padding: 20 }}>
              <div
                onPaste={handlePaste}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { const r = new FileReader(); r.onload = ev => processText(ev.target.result); r.readAsText(f) } }}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: '2px dashed #1e2730', borderRadius: 10, padding: '32px 20px',
                  textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s',
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Drop CSV file, click to browse, or paste data</div>
                <div style={{ color: '#4a5568', fontSize: 12 }}>Supports CSV, TSV, or paste from Excel/Google Sheets</div>
                <div style={{ color: '#4a5568', fontSize: 11, marginTop: 6 }}>Any column order — you'll map the fields next</div>
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

              {/* Preview first 3 rows */}
              <div style={{ fontSize: 10, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: F, fontWeight: 700 }}>Preview (first 3 rows)</div>
              <div style={{ background: '#080b0f', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                {csvData.rows.slice(0, 3).map((row, i) => {
                  const get = (field) => { const col = mapping[field]; if (!col) return '—'; const idx = csvData.headers.indexOf(col); return idx >= 0 ? row[idx] || '—' : '—' }
                  let name = mapping.first_name ? `${get('first_name')} ${get('last_name')}`.trim() : get('full_name')
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 12px', borderBottom: '1px solid #0d1117', fontSize: 12, alignItems: 'center' }}>
                      <span style={{ color: '#f97316', fontWeight: 700, width: 36, fontFamily: F }}>{get('bib_number')}</span>
                      <span style={{ color: '#e2e8f0', flex: 1 }}>{name}</span>
                      <span style={{ color: '#4a5568' }}>{get('team')}</span>
                      <span style={{ color: '#4a5568', width: 24 }}>{get('age')}</span>
                      <span style={{ color: '#4a5568', width: 20 }}>{get('gender')}</span>
                    </div>
                  )
                })}
              </div>

              {csvError && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>{csvError}</div>}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={importCSV} disabled={importing} style={{ ...S.addBtn, flex: 1, opacity: importing ? 0.6 : 1 }}>
                  {importing ? 'Importing…' : `Import ${csvData.rows.length} Athletes`}
                </button>
                <button onClick={() => { setCsvStep('idle'); setCsvData(null); setCsvError('') }} style={{ ...S.backBtn, flex: 0 }}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* Roster */}
        {entries.length > 0 && (
          <div style={S.section}>
            <div style={S.sLabel}>Roster ({entries.length})</div>
            <div style={S.card}>
              {/* Table header */}
              <div style={{ display: 'flex', gap: 10, padding: '6px 14px', borderBottom: '1px solid #1a2030', fontSize: 10, color: '#374151', textTransform: 'uppercase', letterSpacing: 1, fontFamily: F, fontWeight: 700 }}>
                <span style={{ width: 34 }}>Bib</span>
                <span style={{ flex: 1 }}>Name</span>
                <span style={{ width: 100 }}>Team</span>
                <span style={{ width: 30 }}>Age</span>
                <span style={{ width: 24 }}>M/F</span>
                <span style={{ width: 24 }}></span>
              </div>
              {entries.map((entry, i) => (
                <div key={entry.id} style={{ ...S.row, background: i % 2 === 0 ? 'transparent' : '#0a0f16' }}>
                  <div style={S.bibBadge(entry.is_adhoc)}>{entry.bib_number}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: '#e2e8f0' }}>{entry.first_name} {entry.last_name}</span>
                    {entry.is_adhoc && <span style={{ marginLeft: 6, fontSize: 9, background: '#0f1f3a', color: '#60a5fa', padding: '1px 5px', borderRadius: 3, letterSpacing: 1 }}>DAY-OF</span>}
                  </div>
                  <span style={{ width: 100, color: '#4a5568', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.team ?? '—'}</span>
                  <span style={{ width: 30, color: '#4a5568', fontSize: 12 }}>{entry.age ?? '—'}</span>
                  <span style={{ width: 24, color: '#4a5568', fontSize: 12 }}>{entry.gender ?? '—'}</span>
                  <button style={S.removeBtn} onClick={() => removeEntry(entry.id)}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add ad-hoc */}
        {showAdHoc ? (
          <div style={{ ...S.card, padding: 18, marginBottom: 24 }}>
            <div style={{ ...S.sLabel, marginBottom: 12 }}>Add Day-of Runner</div>
            {formError && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>{formError}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { key: 'bib_number', label: 'Bib # *', type: 'text', span: false },
                { key: 'gender', label: 'Gender', type: 'select', span: false },
                { key: 'first_name', label: 'First Name *', type: 'text', span: false },
                { key: 'last_name', label: 'Last Name', type: 'text', span: false },
                { key: 'team', label: 'Team / Club', type: 'text', span: true },
                { key: 'age', label: 'Age', type: 'number', span: false },
              ].map(({ key, label, type, span }) => (
                <div key={key} style={{ gridColumn: span ? '1 / -1' : 'auto' }}>
                  <label style={{ fontSize: 10, color: '#4a5568', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1, fontFamily: F, fontWeight: 700 }}>{label}</label>
                  {type === 'select' ? (
                    <select value={form[key] ?? ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={S.select}>
                      <option value="">—</option>
                      <option value="M">M</option><option value="F">F</option><option value="NB">NB</option>
                    </select>
                  ) : (
                    <input type={type} value={form[key] ?? ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={S.input} onKeyDown={e => e.key === 'Enter' && addAdHoc()} />
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={addAdHoc} disabled={saving} style={{ ...S.addBtn, flex: 1, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Adding…' : 'Add Runner'}
              </button>
              <button onClick={() => { setShowAdHoc(false); setFormError('') }} style={{ ...S.backBtn }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAdHoc(true)}
            style={{ width: '100%', padding: 14, background: '#0e1318', border: '1px dashed #1e2730', borderRadius: 10, color: '#60a5fa', fontSize: 13, cursor: 'pointer', fontFamily: FB, marginBottom: 24 }}
          >
            + Add day-of runner
          </button>
        )}

        {/* Start CTA */}
        <button
          style={{ width: '100%', padding: 18, background: '#16a34a', border: 'none', borderRadius: 12, color: '#fff', fontSize: 20, fontWeight: 900, cursor: 'pointer', fontFamily: F, letterSpacing: 3, textTransform: 'uppercase', boxShadow: '0 4px 24px rgba(22,163,74,0.25)' }}
          onClick={() => navigate(`/race/${eventId}/time`)}
        >
          Start Race ▶
        </button>
        {entries.length === 0 && (
          <p style={{ textAlign: 'center', color: '#374151', fontSize: 12, marginTop: 10 }}>No roster loaded — you can still time and assign bibs manually</p>
        )}
      </div>

      <style>{`
        input:focus, select:focus, textarea:focus { border-color: #f97316 !important; outline: none; }
        input::placeholder { color: #2d3748; }
      `}</style>
    </div>
  )
}
