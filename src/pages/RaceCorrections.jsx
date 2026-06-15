import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const F = "'Barlow Condensed', sans-serif"
const FB = "'Barlow', sans-serif"

function parseElapsedToMs(value) {
  const v = String(value || '').trim()
  if (!v) return null

  const parts = v.split(':')
  if (parts.length === 1) {
    const [sec, cs = '0'] = parts[0].split('.')
    return (parseInt(sec || '0', 10) * 1000) + (parseInt(cs.padEnd(2, '0').slice(0, 2), 10) * 10)
  }

  if (parts.length === 2) {
    const [mm, ssPart] = parts
    const [ss, cs = '0'] = ssPart.split('.')
    return (
      parseInt(mm || '0', 10) * 60000 +
      parseInt(ss || '0', 10) * 1000 +
      parseInt(cs.padEnd(2, '0').slice(0, 2), 10) * 10
    )
  }

  if (parts.length === 3) {
    const [hh, mm, ssPart] = parts
    const [ss, cs = '0'] = ssPart.split('.')
    return (
      parseInt(hh || '0', 10) * 3600000 +
      parseInt(mm || '0', 10) * 60000 +
      parseInt(ss || '0', 10) * 1000 +
      parseInt(cs.padEnd(2, '0').slice(0, 2), 10) * 10
    )
  }

  return null
}

function fmt(ms) {
  if (ms == null) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const cs = Math.floor((ms % 1000) / 10)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function splitSortStamp(row) {
  return new Date(
    row?.updated_at ||
    row?.created_at ||
    row?.captured_at ||
    0
  ).getTime()
}

function choosePreferredSplit(existing, candidate) {
  if (!existing) return candidate
  if (!candidate) return existing

  const existingVoid = existing.status === 'void'
  const candidateVoid = candidate.status === 'void'

  if (existingVoid && !candidateVoid) return candidate
  if (!existingVoid && candidateVoid) return existing

  return splitSortStamp(candidate) >= splitSortStamp(existing) ? candidate : existing
}

export default function RaceCorrections() {
  const { id: eventId } = useParams()
  const navigate = useNavigate()

  const [event, setEvent] = useState(null)
  const [checkpoints, setCheckpoints] = useState([])
  const [entries, setEntries] = useState([])
  const [laps, setLaps] = useState([])
  const [loading, setLoading] = useState(true)

  const [bibSearch, setBibSearch] = useState('')
  const [selectedBib, setSelectedBib] = useState('')

  const [editingRowId, setEditingRowId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [form, setForm] = useState({
    bib_number: '',
    checkpoint_id: '',
    elapsed: '',
    correction_note: '',
  })

  useEffect(() => {
    if (!eventId) return

    async function load() {
      const [
        { data: ev },
        { data: cps },
        { data: ents },
        { data: lapRows },
      ] = await Promise.all([
        supabase.from('race_events').select('*').eq('id', eventId).single(),
        supabase.from('race_checkpoints').select('*').eq('event_id', eventId).order('checkpoint_order'),
        supabase.from('event_entries').select('*').eq('event_id', eventId),
        supabase.from('lap_events').select('*').eq('event_id', eventId),
      ])

      setEvent(ev || null)
      setCheckpoints(cps || [])
      setEntries(ents || [])
      setLaps(lapRows || [])
      setLoading(false)
    }

    load()
  }, [eventId])

  const checkpointMap = useMemo(() => {
    const map = {}
    checkpoints.forEach(cp => { map[cp.id] = cp })
    return map
  }, [checkpoints])

  const entryMap = useMemo(() => {
    const map = {}
    entries.forEach(e => {
      if (!map[e.bib_number]) map[e.bib_number] = []
      map[e.bib_number].push(e)
    })
    return map
  }, [entries])

  const selectedBibValue = selectedBib || bibSearch.trim()
  const selectedEntries = entryMap[selectedBibValue] || []

  const splitMap = useMemo(() => {
    const map = {}
    laps.forEach(l => {
      if (!l.bib_number) return
      const key = `${l.bib_number}:${l.checkpoint_id}`
      map[key] = choosePreferredSplit(map[key], l)
    })
    return map
  }, [laps])

  const timelineRows = useMemo(() => {
    if (!selectedBibValue) return []
    return checkpoints.map(cp => {
      const key = `${selectedBibValue}:${cp.id}`
      return {
        checkpoint: cp,
        split: splitMap[key] || null,
      }
    })
  }, [checkpoints, splitMap, selectedBibValue])

  const historyRows = useMemo(() => {
    if (!selectedBibValue) return []
    return laps
      .filter(l => l.bib_number === selectedBibValue)
      .sort((a, b) => splitSortStamp(b) - splitSortStamp(a))
  }, [laps, selectedBibValue])

  const filteredBibOptions = useMemo(() => {
    const q = bibSearch.trim().toLowerCase()
    const bibs = Array.from(new Set(entries.map(e => e.bib_number).filter(Boolean)))
    if (!q) return bibs.slice(0, 20)
    return bibs.filter(bib => String(bib).toLowerCase().includes(q)).slice(0, 20)
  }, [entries, bibSearch])

  const startAdd = cp => {
    setEditingRowId(null)
    setForm({
      bib_number: selectedBibValue,
      checkpoint_id: cp?.id || '',
      elapsed: '',
      correction_note: '',
    })
  }

  const startEdit = row => {
    setEditingRowId(row.id)
    setForm({
      bib_number: row.bib_number || '',
      checkpoint_id: row.checkpoint_id || '',
      elapsed: row.elapsed_ms != null ? fmt(row.elapsed_ms) : '',
      correction_note: row.correction_note || '',
    })
  }

  const resetForm = () => {
    setEditingRowId(null)
    setForm({
      bib_number: selectedBibValue,
      checkpoint_id: '',
      elapsed: '',
      correction_note: '',
    })
  }

  const saveForm = async () => {
    const bib = form.bib_number.trim()
    const checkpoint_id = form.checkpoint_id
    const elapsed_ms = parseElapsedToMs(form.elapsed)

    if (!bib) return setMessage('Bib is required.')
    if (!checkpoint_id) return setMessage('Checkpoint is required.')
    if (elapsed_ms == null) return setMessage('Valid elapsed time is required.')
    if (!event?.race_started_at) return setMessage('Race start time is required.')

    const entry = (entryMap[bib] || [])[0] || null
    const capturedAt = new Date(new Date(event.race_started_at).getTime() + elapsed_ms).toISOString()

    const payload = {
      bib_number: bib,
      entry_id: entry?.id || null,
      checkpoint_id,
      elapsed_ms,
      captured_at: capturedAt,
      correction_note: form.correction_note.trim() || null,
      is_corrected: true,
      source: 'admin',
      updated_at: new Date().toISOString(),
      status: 'assigned',
    }

    setSaving(true)

    if (editingRowId) {
      const { data, error } = await supabase
        .from('lap_events')
        .update(payload)
        .eq('id', editingRowId)
        .select()
        .single()

      setSaving(false)
      if (error || !data) return setMessage(error?.message || 'Could not update split.')

      setLaps(prev => prev.map(l => (l.id === data.id ? data : l)))
      setMessage('Split updated.')
      resetForm()
      return
    }

    const { data, error } = await supabase
      .from('lap_events')
      .insert({
        event_id: eventId,
        ...payload,
      })
      .select()
      .single()

    setSaving(false)
    if (error || !data) return setMessage(error?.message || 'Could not add split.')

    setLaps(prev => [...prev, data])
    setMessage('Split added.')
    resetForm()
  }

  const voidSplit = async row => {
    const { data, error } = await supabase
      .from('lap_events')
      .update({
        status: 'void',
        is_corrected: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .select()
      .single()

    if (error || !data) return setMessage(error?.message || 'Could not void split.')
    setLaps(prev => prev.map(l => (l.id === data.id ? data : l)))
    setMessage('Split voided.')
  }

  const restoreSplit = async row => {
    const { data, error } = await supabase
      .from('lap_events')
      .update({
        status: 'assigned',
        is_corrected: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .select()
      .single()

    if (error || !data) return setMessage(error?.message || 'Could not restore split.')
    setLaps(prev => prev.map(l => (l.id === data.id ? data : l)))
    setMessage('Split restored.')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: '#080b0f', color: '#4a5568', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FB }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#080b0f', color: '#e2e8f0', fontFamily: FB }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid #1a2030', background: '#0c1018', flexWrap: 'wrap' }}>
        <button onClick={() => navigate(`/race/${eventId}/setup`)} style={backBtn()}>
          ← Back
        </button>

        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 10, color: '#f97316', letterSpacing: 2, fontFamily: F, fontWeight: 700 }}>
            ADMIN CORRECTIONS
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: F }}>
            {event?.name}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
        <div className="rc-grid" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
          <div style={card()}>
            <div style={sectionLabel()}>Select Bib</div>

            <input
              value={bibSearch}
              onChange={e => {
                setBibSearch(e.target.value)
                setSelectedBib('')
                setForm(f => ({ ...f, bib_number: e.target.value }))
              }}
              placeholder="Search bib"
              style={inputStyle()}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto', marginTop: 10 }}>
              {filteredBibOptions.map(bib => (
                <button
                  key={bib}
                  onClick={() => {
                    setSelectedBib(bib)
                    setBibSearch(bib)
                    setForm(f => ({ ...f, bib_number: bib }))
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '9px 10px',
                    borderRadius: 8,
                    border: '1px solid #1e2730',
                    background: selectedBibValue === bib ? '#1d4ed8' : '#080b0f',
                    color: '#fff',
                    cursor: 'pointer',
                    fontFamily: F,
                    fontWeight: 700,
                    letterSpacing: 1,
                  }}
                >
                  Bib {bib}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={sectionLabel()}>Roster Match</div>

              {selectedEntries.length ? selectedEntries.map(entry => (
                <div key={entry.id} style={rosterCard()}>
                  <div style={{ color: '#e2e8f0', fontSize: 13 }}>
                    {entry.first_name} {entry.last_name}
                  </div>
                  <div style={{ color: '#4a5568', fontSize: 12 }}>
                    {entry.team || '—'} {entry.division ? `· ${entry.division}` : ''}
                  </div>
                </div>
              )) : (
                <div style={{ color: '#4a5568', fontSize: 12 }}>
                  No roster match for this bib.
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateRows: 'auto auto auto', gap: 20 }}>
            <div style={{ ...card(), overflow: 'hidden', padding: 0 }}>
              <div style={cardHeader()}>
                Split Timeline {selectedBibValue ? `· Bib ${selectedBibValue}` : ''}
              </div>

              {!selectedBibValue ? (
                <div style={{ padding: 20, color: '#4a5568', fontSize: 13 }}>
                  Select a bib to view or correct splits.
                </div>
              ) : (
                <div>
                  {timelineRows.map(({ checkpoint, split }, i) => (
                    <div key={checkpoint.id} className="rc-row" style={timelineRow(i)}>
                      <span style={{ fontFamily: F, color: '#f97316', fontWeight: 700 }}>
                        CP {checkpoint.checkpoint_order}
                      </span>

                      <span style={{ color: '#e2e8f0', fontSize: 13 }}>
                        {split ? fmt(split.elapsed_ms) : 'Missing'}
                      </span>

                      <span style={{ color: split?.status === 'void' ? '#f87171' : split ? '#22c55e' : '#f59e0b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                        {split ? split.status : 'missing'}
                      </span>

                      <span style={{ color: '#4a5568', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {split?.correction_note || '—'}
                      </span>

                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {split ? (
                          <>
                            <button onClick={() => startEdit(split)} style={miniBtn('#60a5fa', '#1e2730')}>Edit</button>
                            {split.status === 'void'
                              ? <button onClick={() => restoreSplit(split)} style={miniBtn('#22c55e', '#1f5130')}>Restore</button>
                              : <button onClick={() => voidSplit(split)} style={miniBtn('#f87171', '#4b1f1f')}>Void</button>}
                          </>
                        ) : (
                          <button onClick={() => startAdd(checkpoint)} style={solidBtn()}>
                            Add Split
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={card()}>
              <div style={sectionLabel()}>
                {editingRowId ? 'Edit Split' : 'Add / Correct Split'}
              </div>

              <div className="rc-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <input value={form.bib_number} onChange={e => setForm(f => ({ ...f, bib_number: e.target.value }))} placeholder="Bib" style={inputStyle()} />
                <select value={form.checkpoint_id} onChange={e => setForm(f => ({ ...f, checkpoint_id: e.target.value }))} style={inputStyle()}>
                  <option value="">Select checkpoint</option>
                  {checkpoints.map(cp => (
                    <option key={cp.id} value={cp.id}>
                      CP {cp.checkpoint_order} · {cp.name}
                    </option>
                  ))}
                </select>
                <input value={form.elapsed} onChange={e => setForm(f => ({ ...f, elapsed: e.target.value }))} placeholder="Elapsed (MM:SS.CS)" style={inputStyle()} />
              </div>

              <textarea
                value={form.correction_note}
                onChange={e => setForm(f => ({ ...f, correction_note: e.target.value }))}
                placeholder="Correction note (optional)"
                rows={3}
                style={{ ...inputStyle(), resize: 'vertical', marginBottom: 10 }}
              />

              {message && <div style={{ color: '#f59e0b', fontSize: 12, marginBottom: 10 }}>{message}</div>}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={saveForm} disabled={saving} style={{ ...solidBtn(), opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving…' : editingRowId ? 'Save Changes' : 'Add Split'}
                </button>
                <button onClick={resetForm} style={miniBtn('#94a3b8', '#1e2730')}>Clear</button>
              </div>
            </div>

            <div style={{ ...card(), overflow: 'hidden', padding: 0 }}>
              <div style={cardHeader()}>
                Split History {selectedBibValue ? `· Bib ${selectedBibValue}` : ''}
              </div>

              {!selectedBibValue ? (
                <div style={{ padding: 20, color: '#4a5568', fontSize: 13 }}>
                  Select a bib to inspect split history.
                </div>
              ) : historyRows.length === 0 ? (
                <div style={{ padding: 20, color: '#4a5568', fontSize: 13 }}>
                  No split history for this bib yet.
                </div>
              ) : (
                <div>
                  {historyRows.map((row, i) => {
                    const cp = checkpointMap[row.checkpoint_id]
                    const stamp = row.updated_at || row.created_at || row.captured_at
                    return (
                      <div key={row.id} className="rc-history-row" style={historyRow(i, row.status)}>
                        <div style={{ fontFamily: F, color: '#f97316', fontWeight: 700 }}>
                          {cp ? `CP ${cp.checkpoint_order}` : 'Unknown CP'}
                        </div>

                        <div style={{ color: '#e2e8f0', fontFamily: F }}>
                          {fmt(row.elapsed_ms)}
                        </div>

                        <div style={{ color: row.status === 'void' ? '#f87171' : '#22c55e', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                          {row.status}
                        </div>

                        <div style={{ color: '#4a5568', fontSize: 12 }}>
                          {row.source || 'manual'}
                        </div>

                        <div style={{ color: '#4a5568', fontSize: 12 }}>
                          {stamp ? new Date(stamp).toLocaleString() : '—'}
                        </div>

                        <div style={{ color: '#94a3b8', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.correction_note || '—'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        input:focus, select:focus, textarea:focus {
          border-color: #f97316 !important;
          outline: none;
        }

        @media (max-width: 900px) {
          .rc-grid {
            grid-template-columns: 1fr !important;
          }

          .rc-form-grid {
            grid-template-columns: 1fr !important;
          }

          .rc-row, .rc-history-row {
            grid-template-columns: 1fr !important;
            gap: 6px !important;
          }
        }
      `}</style>
    </div>
  )
}

function backBtn() {
  return {
    background: 'none',
    border: '1px solid #1e2730',
    color: '#4a5568',
    borderRadius: 6,
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: F,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  }
}

function card() {
  return {
    background: '#0e1318',
    border: '1px solid #1a2030',
    borderRadius: 12,
    padding: 16,
  }
}

function cardHeader() {
  return {
    padding: '12px 14px',
    borderBottom: '1px solid #1a2030',
    fontSize: 10,
    color: '#4a5568',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontFamily: F,
    fontWeight: 700,
  }
}

function sectionLabel() {
  return {
    fontSize: 10,
    color: '#4a5568',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontFamily: F,
    fontWeight: 700,
    marginBottom: 10,
  }
}

function rosterCard() {
  return {
    padding: '8px 10px',
    background: '#080b0f',
    border: '1px solid #1e2730',
    borderRadius: 8,
    marginBottom: 6,
  }
}

function inputStyle() {
  return {
    width: '100%',
    padding: '10px 12px',
    background: '#080b0f',
    border: '1px solid #1e2730',
    borderRadius: 8,
    color: '#fff',
    fontFamily: FB,
    outline: 'none',
    boxSizing: 'border-box',
  }
}

function solidBtn() {
  return {
    padding: '10px 16px',
    borderRadius: 8,
    border: 'none',
    background: '#1d4ed8',
    color: '#fff',
    cursor: 'pointer',
    fontFamily: F,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  }
}

function miniBtn(color, border) {
  return {
    padding: '6px 10px',
    borderRadius: 8,
    border: `1px solid ${border}`,
    background: 'transparent',
    color,
    cursor: 'pointer',
    fontFamily: F,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  }
}

function timelineRow(i) {
  return {
    display: 'grid',
    gridTemplateColumns: '90px 100px 110px 1fr 160px',
    gap: 10,
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid #0d1117',
    background: i % 2 === 0 ? 'transparent' : '#0a0c10',
  }
}

function historyRow(i, status) {
  return {
    display: 'grid',
    gridTemplateColumns: '90px 110px 90px 90px 160px 1fr',
    gap: 10,
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid #0d1117',
    background: status === 'void' ? '#1a0f0f' : i % 2 === 0 ? 'transparent' : '#0a0c10',
    opacity: status === 'void' ? 0.75 : 1,
  }
}