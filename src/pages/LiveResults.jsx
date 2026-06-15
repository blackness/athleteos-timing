import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getRaceElapsedMs, formatRaceClock } from '../lib/raceClock'

const C = {
  bg: '#080b0f',
  surface: '#0e1318',
  surface2: '#141920',
  border: '#1e2730',
  text: '#f0f4f8',
  muted: '#4a5568',
  orange: '#f97316',
  blue: '#3b82f6',
  green: '#10b981',
  red: '#ef4444',
  yellow: '#eab308',
}

const fontHead = "'Barlow Condensed', sans-serif"
const fontBody = "'Barlow', sans-serif"
const fontMono = "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace"

const TEAM_COLORS = [C.green, C.blue, C.yellow, '#9d6aff', C.red, '#f97316', '#06b6d4', '#ec4899']

function fmtTime(ms) {
  if (ms == null) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const cs = Math.floor((ms % 1000) / 10)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function fmtGap(ms) {
  if (!ms || ms <= 0) return null
  const s = ms / 1000
  return s < 60 ? `+${s.toFixed(1)}s` : `+${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
}

function getDisplayName(entry) {
  if (!entry) return null
  return `${entry.first_name ?? ''}${entry.last_name ? ` ${entry.last_name}` : ''}`.trim() || null
}

function thStyle() {
  return {
    padding: '8px 12px',
    textAlign: 'left',
    fontFamily: fontHead,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: C.muted,
    whiteSpace: 'nowrap',
  }
}

function tdStyle(mono = false) {
  return {
    padding: '7px 12px',
    fontFamily: mono ? fontMono : fontBody,
    fontSize: 12,
    color: C.text,
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
  }
}

function emptyStateStyle() {
  return {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: '48px 0',
    textAlign: 'center',
    color: C.muted,
    fontFamily: fontBody,
    fontSize: 14,
  }
}

function ProgressTable({ rows, checkpoints }) {
  if (!rows.length) {
    return <div style={emptyStateStyle()}>No entries or checkpoint activity yet…</div>
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['Bib', 'Name', 'Team', 'Division', ...checkpoints.map(cp => `CP${cp.checkpoint_order}`), 'Finish'].map(h => (
              <th key={h} style={thStyle()}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.id}
              style={{
                borderBottom: `1px solid ${C.border}18`,
                background: i % 2 === 0 ? 'transparent' : C.surface2 + '40',
              }}
            >
              <td style={tdStyle(true)}>{r.bib_number}</td>

              <td style={tdStyle()}>
                <div
                  style={{
                    color: r.name ? C.text : C.muted,
                    fontWeight: 600,
                    fontStyle: r.name ? 'normal' : 'italic',
                  }}
                >
                  {r.name || 'not in roster'}
                </div>
              </td>

              <td style={tdStyle()}>
                {r.team ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: r.teamColor || C.muted, display: 'inline-block' }} />
                    <span style={{ color: C.muted }}>{r.team}</span>
                  </span>
                ) : (
                  <span style={{ color: C.muted }}>—</span>
                )}
              </td>

              <td style={tdStyle()}>
                <span style={{ color: r.division ? C.text : C.muted }}>
                  {r.division || '—'}
                </span>
              </td>

              {checkpoints.map(cp => {
                const split = r.splits[cp.id]
                return (
                  <td key={cp.id} style={tdStyle(true)}>
                    {split ? (
                      <span style={{ color: C.text }}>{fmtTime(split.elapsed_ms)}</span>
                    ) : (
                      <span style={{ color: '#2d3748' }}>—</span>
                    )}
                  </td>
                )
              })}

              <td style={tdStyle(true)}>
                {r.finish ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ color: C.green, fontWeight: 700 }}>{fmtTime(r.finish.time_ms)}</span>
                    <span style={{ color: C.muted, fontSize: 10 }}>#{r.finish.place}</span>
                  </div>
                ) : (
                  <span style={{ color: '#2d3748' }}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ResultsTable({ rows }) {
  if (!rows.length) {
    return <div style={emptyStateStyle()}>No finishers in this division yet…</div>
  }

  const leaderMs = rows.find(r => r.time_ms != null)?.time_ms ?? null
  const medals = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['#', 'Bib', 'Athlete', 'Team', 'Division', 'Time', 'Gap'].map(h => (
              <th key={h} style={thStyle()}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const medal = medals[r.place]
            const gap = leaderMs != null && r.time_ms != null ? r.time_ms - leaderMs : null

            return (
              <tr
                key={r.id}
                style={{
                  borderBottom: `1px solid ${C.border}18`,
                  background: i % 2 === 0 ? 'transparent' : C.surface2 + '40',
                }}
              >
                <td style={tdStyle()}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: medal ?? C.surface2,
                      fontSize: 11,
                      fontWeight: 800,
                      fontFamily: fontHead,
                      color: medal ? '#000' : C.muted,
                    }}
                  >
                    {r.place}
                  </span>
                </td>

                <td style={tdStyle(true)}>{r.bib_number ?? '—'}</td>

                <td style={tdStyle()}>
                  <span style={{ color: r.name ? C.text : C.muted, fontStyle: r.name ? 'normal' : 'italic' }}>
                    {r.name ?? 'not in roster'}
                  </span>
                </td>

                <td style={tdStyle()}>
                  {r.team ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: r.teamColor || C.muted, display: 'inline-block' }} />
                      <span style={{ color: C.muted }}>{r.team}</span>
                    </span>
                  ) : (
                    <span style={{ color: C.muted }}>—</span>
                  )}
                </td>

                <td style={tdStyle()}>{r.division || '—'}</td>
                <td style={tdStyle(true)}>{fmtTime(r.time_ms)}</td>

                <td style={tdStyle(true)}>
                  {gap === 0 ? (
                    <span style={{ color: C.green }}>Leader</span>
                  ) : gap ? (
                    <span style={{ color: C.muted }}>{fmtGap(gap)}</span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TeamsTable({ rows }) {
  if (!rows.length) {
    return <div style={emptyStateStyle()}>No team data in this division yet…</div>
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['Team', 'Division', 'Entries', 'Finished', 'Best Finish', 'Best Time'].map(h => (
              <th key={h} style={thStyle()}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.team}-${r.division}`}
              style={{
                borderBottom: `1px solid ${C.border}18`,
                background: i % 2 === 0 ? 'transparent' : C.surface2 + '40',
              }}
            >
              <td style={tdStyle()}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.teamColor || C.muted, display: 'inline-block' }} />
                  <span style={{ color: C.text, fontWeight: 600 }}>{r.team}</span>
                </span>
              </td>
              <td style={tdStyle()}>{r.division || '—'}</td>
              <td style={tdStyle(true)}>{r.entries}</td>
              <td style={tdStyle(true)}>{r.finished}</td>
              <td style={tdStyle(true)}>{r.bestPlace ?? '—'}</td>
              <td style={tdStyle(true)}>{r.bestTime != null ? fmtTime(r.bestTime) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function LiveResults() {
  const { id: eventId } = useParams()

  const [event, setEvent] = useState(null)
  const [entries, setEntries] = useState([])
  const [checkpoints, setCheckpoints] = useState([])
  const [laps, setLaps] = useState([])
  const [finishes, setFinishes] = useState([])
  const [teamMap, setTeamMap] = useState({})
  const [tab, setTab] = useState('progress')
  const [divisionFilter, setDivisionFilter] = useState('all')
  const [lastUpdate, setLastUpdate] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (event?.status !== 'active') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [event?.status])

  useEffect(() => {
    if (!eventId) return

    async function load() {
      const [
        { data: eventData },
        { data: entryData },
        { data: checkpointData },
        { data: lapData },
        { data: finishData },
      ] = await Promise.all([
        supabase.from('race_events').select('*').eq('id', eventId).single(),
        supabase.from('event_entries').select('*').eq('event_id', eventId).order('bib_number'),
        supabase.from('race_checkpoints').select('*').eq('event_id', eventId).eq('is_active', true).order('checkpoint_order'),
        supabase.from('lap_events').select('*').eq('event_id', eventId).neq('status', 'void'),
        supabase.from('race_finishes').select('*').eq('event_id', eventId).order('place', { ascending: true }),
      ])

      setEvent(eventData || null)
      setEntries(entryData || [])
      setCheckpoints(checkpointData || [])
      setLaps(lapData || [])
      setFinishes(finishData || [])

      const teams = {}
      let ci = 0
      ;(entryData || []).forEach(e => {
        if (e.team && !teams[e.team]) teams[e.team] = TEAM_COLORS[ci++ % TEAM_COLORS.length]
      })
      setTeamMap(teams)

      if ((lapData?.length || 0) > 0 || (finishData?.length || 0) > 0) {
        setLastUpdate(new Date())
      }
    }

    load()

    const ch = supabase
      .channel(`live-results:${eventId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'race_events', filter: `id=eq.${eventId}` },
        payload => {
          setEvent(payload.new)
          setLastUpdate(new Date())
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lap_events', filter: `event_id=eq.${eventId}` },
        async () => {
          const { data } = await supabase
            .from('lap_events')
            .select('*')
            .eq('event_id', eventId)
            .neq('status', 'void')

          setLaps(data || [])
          setLastUpdate(new Date())
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'race_finishes', filter: `event_id=eq.${eventId}` },
        async () => {
          const { data } = await supabase
            .from('race_finishes')
            .select('*')
            .eq('event_id', eventId)
            .order('place', { ascending: true })

          setFinishes(data || [])
          setLastUpdate(new Date())
        }
      )
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [eventId])

  const raceElapsedMs = getRaceElapsedMs(event, now)
  const isLive = event?.status === 'active'

  const entryMap = useMemo(() => {
    const map = {}
    entries.forEach(e => {
      map[e.bib_number] = e
    })
    return map
  }, [entries])

  const finishMap = useMemo(() => {
    const map = {}
    finishes.forEach(f => {
      if (f.bib_number) map[f.bib_number] = f
    })
    return map
  }, [finishes])

  const divisions = useMemo(() => {
    const vals = new Set()

    entries.forEach(e => {
      if (e.division) vals.add(e.division)
    })

    laps.forEach(l => {
      if (l.bib_number) {
        const entry = entryMap[l.bib_number]
        if (entry?.division) vals.add(entry.division)
      }
    })

    finishes.forEach(f => {
      if (f.bib_number) {
        const entry = entryMap[f.bib_number]
        if (entry?.division) vals.add(entry.division)
      }
    })

    const out = Array.from(vals).sort((a, b) => a.localeCompare(b))
    return out
  }, [entries, laps, finishes, entryMap])

  const progressRows = useMemo(() => {
    const splitMap = {}
    const allBibs = new Set()

    entries.forEach(entry => {
      if (entry.bib_number) allBibs.add(entry.bib_number)
    })

    laps.forEach(l => {
      if (!l.bib_number || l.status === 'void') return
      allBibs.add(l.bib_number)

      const key = `${l.bib_number}:${l.checkpoint_id}`
      const existing = splitMap[key]

      if (!existing || new Date(l.captured_at) > new Date(existing.captured_at)) {
        splitMap[key] = l
      }
    })

    finishes.forEach(f => {
      if (f.bib_number) allBibs.add(f.bib_number)
    })

    return Array.from(allBibs)
      .map(bib => {
        const entry = entryMap[bib] || null
        const splits = {}

        checkpoints.forEach(cp => {
          const key = `${bib}:${cp.id}`
          if (splitMap[key]) splits[cp.id] = splitMap[key]
        })

        return {
          id: entry?.id || `bib-${bib}`,
          bib_number: bib,
          name: getDisplayName(entry),
          team: entry?.team || null,
          teamColor: entry?.team ? teamMap[entry.team] : null,
          division: entry?.division || null,
          splits,
          finish: finishMap[bib] || null,
          isUnknownEntry: !entry,
        }
      })
      .sort((a, b) => {
        const aFinish = a.finish?.place ?? Infinity
        const bFinish = b.finish?.place ?? Infinity
        if (aFinish !== bFinish) return aFinish - bFinish
        return String(a.bib_number).localeCompare(String(b.bib_number), undefined, { numeric: true })
      })
  }, [entries, laps, finishes, checkpoints, entryMap, finishMap, teamMap])

  const resultsRows = useMemo(() => {
    return finishes.map(f => {
      const entry = f.bib_number ? entryMap[f.bib_number] : null
      return {
        ...f,
        name: getDisplayName(entry),
        team: entry?.team || null,
        teamColor: entry?.team ? teamMap[entry.team] : null,
        division: entry?.division || null,
        isUnknownEntry: !entry,
      }
    })
  }, [finishes, entryMap, teamMap])

  const teamRows = useMemo(() => {
    const grouped = {}

    entries.forEach(e => {
      if (!e.team) return
      const key = `${e.team}::${e.division || ''}`
      if (!grouped[key]) {
        grouped[key] = {
          team: e.team,
          division: e.division || null,
          teamColor: teamMap[e.team] || null,
          entries: 0,
          finished: 0,
          bestPlace: null,
          bestTime: null,
        }
      }
      grouped[key].entries += 1
    })

    finishes.forEach(f => {
      const entry = f.bib_number ? entryMap[f.bib_number] : null
      if (!entry?.team) return

      const key = `${entry.team}::${entry.division || ''}`
      const g = grouped[key]
      if (!g) return

      g.finished += 1
      if (g.bestPlace == null || f.place < g.bestPlace) g.bestPlace = f.place
      if (g.bestTime == null || f.time_ms < g.bestTime) g.bestTime = f.time_ms
    })

    return Object.values(grouped).sort((a, b) => {
      const aPlace = a.bestPlace ?? Infinity
      const bPlace = b.bestPlace ?? Infinity
      if (aPlace !== bPlace) return aPlace - bPlace
      return a.team.localeCompare(b.team)
    })
  }, [entries, finishes, entryMap, teamMap])

  const filteredProgressRows = useMemo(() => {
    if (divisionFilter === 'all') return progressRows
    if (divisionFilter === 'unknown') return progressRows.filter(r => !r.division)
    return progressRows.filter(r => r.division === divisionFilter)
  }, [progressRows, divisionFilter])

  const filteredResultsRows = useMemo(() => {
    if (divisionFilter === 'all') return resultsRows
    if (divisionFilter === 'unknown') return resultsRows.filter(r => !r.division)
    return resultsRows.filter(r => r.division === divisionFilter)
  }, [resultsRows, divisionFilter])

  const filteredTeamRows = useMemo(() => {
    if (divisionFilter === 'all') return teamRows
    if (divisionFilter === 'unknown') return teamRows.filter(r => !r.division)
    return teamRows.filter(r => r.division === divisionFilter)
  }, [teamRows, divisionFilter])

  const hasUnknownDivisionRows = useMemo(() => {
    return progressRows.some(r => !r.division)
  }, [progressRows])

  const tabBtn = active => ({
    padding: '10px 16px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontFamily: fontHead,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: active ? C.orange : C.muted,
    borderBottom: active ? `2px solid ${C.orange}` : '2px solid transparent',
  })

  const subTabBtn = active => ({
    padding: '8px 14px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontFamily: fontHead,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: active ? C.blue : C.muted,
    borderBottom: active ? `2px solid ${C.blue}` : '2px solid transparent',
  })

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, color: C.text, fontFamily: fontBody }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '14px 20px' }}>
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 9, color: C.orange, letterSpacing: 3, fontFamily: fontHead, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
              AthleteOS · Live Results
            </div>

            <div style={{ fontSize: 24, fontWeight: 900, fontFamily: fontHead, letterSpacing: 0.5, marginBottom: 4 }}>
              {event?.name ?? '…'}
            </div>

            <div style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {event?.distance && <span>{event.distance}</span>}
              {event?.location && <span>📍 {event.location}</span>}
              {event?.event_date && (
                <span>
                  {new Date(event.event_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              )}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: 10,
                color: isLive ? C.red : event?.status === 'finished' ? C.muted : C.yellow,
                letterSpacing: 2,
                fontFamily: fontHead,
                fontWeight: 700,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              {isLive ? 'Race Clock' : event?.status === 'finished' ? 'Final Time' : 'Waiting For Start'}
            </div>

            <div
              style={{
                fontSize: 'clamp(28px, 4vw, 42px)',
                fontWeight: 900,
                fontFamily: fontHead,
                letterSpacing: -1.5,
                lineHeight: 1,
                color: event?.race_started_at ? C.text : '#374151',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatRaceClock(raceElapsedMs)}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginTop: 6 }}>
              {isLive && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 9,
                    fontWeight: 700,
                    color: C.red,
                    letterSpacing: 2,
                    fontFamily: fontHead,
                    textTransform: 'uppercase',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: C.red,
                      display: 'inline-block',
                      animation: 'livePulse 1.2s ease-in-out infinite',
                    }}
                  />
                  LIVE
                </span>
              )}

              {lastUpdate && (
                <div style={{ fontSize: 10, color: C.muted }}>
                  Updated {lastUpdate.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {[
            { label: 'Entries / Seen Bibs', value: progressRows.length, color: C.text },
            { label: 'Checkpoints', value: checkpoints.length, color: C.muted },
            { label: 'Assigned splits', value: laps.filter(l => !!l.bib_number && l.status !== 'void').length, color: C.green },
            { label: 'Finishers', value: finishes.filter(f => !!f.bib_number).length, color: C.blue },
            { label: 'Teams', value: Object.keys(teamMap).length, color: C.muted },
          ].map((s, idx, arr) => (
            <div
              key={s.label}
              style={{
                padding: '10px 12px',
                borderRight: idx < arr.length - 1 ? `1px solid ${C.border}` : 'none',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: fontHead, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Tabs */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', minWidth: 'max-content' }}>
          <button style={tabBtn(tab === 'progress')} onClick={() => setTab('progress')}>
            Progress
          </button>
          <button style={tabBtn(tab === 'results')} onClick={() => setTab('results')}>
            Results
          </button>
          <button style={tabBtn(tab === 'teams')} onClick={() => setTab('teams')}>
            Teams
          </button>
        </div>
      </div>

      {/* Division Filter Tabs */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', minWidth: 'max-content' }}>
          <button
            style={subTabBtn(divisionFilter === 'all')}
            onClick={() => setDivisionFilter('all')}
          >
            All Divisions
          </button>

          {divisions.map(div => (
            <button
              key={div}
              style={subTabBtn(divisionFilter === div)}
              onClick={() => setDivisionFilter(div)}
            >
              {div}
            </button>
          ))}

          {hasUnknownDivisionRows && (
            <button
              style={subTabBtn(divisionFilter === 'unknown')}
              onClick={() => setDivisionFilter('unknown')}
            >
              Unknown
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 20px' }}>
        {tab === 'progress' && (
          <ProgressTable rows={filteredProgressRows} checkpoints={checkpoints} />
        )}

        {tab === 'results' && (
          <ResultsTable rows={filteredResultsRows} />
        )}

        {tab === 'teams' && (
          <TeamsTable rows={filteredTeamRows} />
        )}
      </div>

      <div style={{ textAlign: 'center', color: '#1f2937', fontSize: 11, padding: '24px 0', letterSpacing: 1, fontFamily: fontHead }}>
        POWERED BY ATHLETOS
      </div>

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1 }
          50% { opacity: 0.3 }
        }
      `}</style>
    </div>
  )
}