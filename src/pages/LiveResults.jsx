import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ── Design tokens ──────────────────────────────────────────
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

function ExpandedSplits({ row }) {
  if (!row?.splits?.length) return null

  return (
    <div style={{ padding: '12px 16px', background: C.surface2 + '60', borderTop: `1px solid ${C.border}` }}>
      <div style={{ fontFamily: fontHead, fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>
        Splits
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {row.splits.map((s, idx) => {
          const prev = idx > 0 ? row.splits[idx - 1] : null
          const segmentMs = prev ? s.elapsed_ms - prev.elapsed_ms : s.elapsed_ms

          return (
            <div
              key={s.checkpoint_id}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 120px 120px',
                gap: 12,
                alignItems: 'center',
                fontFamily: fontBody,
                fontSize: 13,
              }}
            >
              <div style={{ color: C.text, fontWeight: 600 }}>
                {s.checkpoint_name}
              </div>
              <div style={{ color: C.text, fontFamily: fontMono, fontVariantNumeric: 'tabular-nums' }}>
                Elapsed: {fmtTime(s.elapsed_ms)}
              </div>
              <div style={{ color: C.muted, fontFamily: fontMono, fontVariantNumeric: 'tabular-nums' }}>
                Segment: {fmtTime(segmentMs)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ResultsTable({ rows, selTeam, showDiv, expandedBib, onToggleExpand }) {
  if (rows.length === 0) {
    return (
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '48px 0', textAlign: 'center', color: C.muted, fontFamily: fontBody, fontSize: 14 }}>
        Waiting for split data…
      </div>
    )
  }

  const medals = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: fontBody, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['#', 'Bib', 'Athlete', 'Team', showDiv ? 'Div' : null, 'Last CP', 'Elapsed', 'Gap'].filter(Boolean).map(h => (
              <th
                key={h}
                style={{
                  padding: '8px 12px',
                  textAlign: 'left',
                  fontFamily: fontHead,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: C.muted,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((r, i) => {
            const medal = medals[r.divPlace ?? r.place]
            const expanded = expandedBib === r.bib_number

            return (
              <>
                <tr
                  key={r.bib_number}
                  onClick={() => onToggleExpand(r.bib_number)}
                  style={{
                    borderBottom: expanded ? 'none' : `1px solid ${C.border}18`,
                    background: selTeam && r.team === selTeam
                      ? C.green + '12'
                      : i % 2 === 0
                        ? 'transparent'
                        : C.surface2 + '40',
                    cursor: 'pointer',
                  }}
                >
                  <td style={{ padding: '7px 12px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: medal ?? C.surface2, fontSize: 11, fontWeight: 800, fontFamily: fontHead, color: medal ? '#000' : C.muted }}>
                      {r.divPlace ?? r.place}
                    </span>
                  </td>

                  <td style={{ padding: '7px 12px', color: C.muted, fontFamily: fontMono, fontSize: 12 }}>
                    {r.bib_number}
                  </td>

                  <td style={{ padding: '7px 12px', fontWeight: 500, color: r.name ? C.text : C.muted }}>
                    <div>{r.name ?? 'Unknown athlete'}</div>
                  </td>

                  <td style={{ padding: '7px 12px' }}>
                    {r.team ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: r.teamColor ?? C.muted, flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ color: C.muted, fontSize: 12 }}>{r.team}</span>
                      </span>
                    ) : (
                      <span style={{ color: C.muted }}>—</span>
                    )}
                  </td>

                  {showDiv && (
                    <td style={{ padding: '7px 12px' }}>
                      {r.division && r.gender ? (
                        <span style={{ fontSize: 9, fontFamily: fontHead, fontWeight: 700, letterSpacing: 1, padding: '2px 6px', borderRadius: 3, background: C.surface2, color: C.muted, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                          {r.division} {r.gender}
                        </span>
                      ) : (
                        <span style={{ color: C.muted }}>—</span>
                      )}
                    </td>
                  )}

                  <td style={{ padding: '7px 12px', color: C.muted, fontSize: 12 }}>
                    {r.latest_checkpoint_name ?? '—'}
                  </td>

                  <td style={{ padding: '7px 12px', fontWeight: 700, fontFamily: fontMono, fontSize: 12, fontVariantNumeric: 'tabular-nums', color: C.text }}>
                    {fmtTime(r.latest_elapsed_ms)}
                  </td>

                  <td style={{ padding: '7px 12px', fontFamily: fontMono, fontSize: 11, color: r.gap === 0 ? C.green : C.muted, fontVariantNumeric: 'tabular-nums' }}>
                    {r.gap === 0 ? 'Leader' : r.gap ? fmtGap(r.gap) : '—'}
                  </td>
                </tr>

                {expanded && (
                  <tr>
                    <td colSpan={showDiv ? 8 : 7} style={{ padding: 0 }}>
                      <ExpandedSplits row={r} />
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function LiveResults() {
  const { id: eventId } = useParams()

  const [event, setEvent] = useState(null)
  const [entries, setEntries] = useState({})
  const [teamMap, setTeamMap] = useState({})
  const [checkpoints, setCheckpoints] = useState([])
  const [lapEvents, setLapEvents] = useState([])
  const [tab, setTab] = useState('all')
  const [selTeam, setSelTeam] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [expandedBib, setExpandedBib] = useState(null)

  const [clockMs, setClockMs] = useState(0)
  const tickRef = useRef(null)

  useEffect(() => {
    if (!eventId) return

    async function load() {
      const [
        { data: eventData },
        { data: entryData },
        { data: checkpointData },
        { data: lapData },
      ] = await Promise.all([
        supabase.from('race_events').select('*').eq('id', eventId).single(),
        supabase.from('event_entries').select('*').eq('event_id', eventId),
        supabase.from('race_checkpoints').select('*').eq('event_id', eventId).eq('is_active', true).order('checkpoint_order', { ascending: true }),
        supabase.from('lap_events').select('*').eq('event_id', eventId).eq('status', 'assigned'),
      ])

      setEvent(eventData || null)

      const entryMap = {}
      const teams = {}
      let ci = 0
      ;(entryData || []).forEach(e => {
        entryMap[e.bib_number] = e
        if (e.team && !teams[e.team]) teams[e.team] = TEAM_COLORS[ci++ % TEAM_COLORS.length]
      })
      setEntries(entryMap)
      setTeamMap(teams)

      setCheckpoints(checkpointData || [])
      setLapEvents(lapData || [])
      if ((lapData || []).length) setLastUpdate(new Date())
    }

    load()

    const ch = supabase
      .channel(`live-results:${eventId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'race_events', filter: `id=eq.${eventId}` },
        p => {
          setEvent(p.new)
          setLastUpdate(new Date())
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lap_events', filter: `event_id=eq.${eventId}` },
        p => {
          setLastUpdate(new Date())

          if (p.eventType === 'INSERT') {
            if (p.new.status !== 'assigned') return
            setLapEvents(prev => (prev.find(x => x.id === p.new.id) ? prev : [...prev, p.new]))
          } else if (p.eventType === 'UPDATE') {
            setLapEvents(prev => {
              const exists = prev.find(x => x.id === p.new.id)

              if (p.new.status === 'assigned') {
                if (exists) return prev.map(x => (x.id === p.new.id ? p.new : x))
                return [...prev, p.new]
              }

              // if moved away from assigned, remove from public list
              return prev.filter(x => x.id !== p.new.id)
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
      clearInterval(tickRef.current)
    }
  }, [eventId])

  // live race clock
  useEffect(() => {
    clearInterval(tickRef.current)

    if (event?.race_started_at && event?.status === 'active') {
      const start = new Date(event.race_started_at).getTime()
      setClockMs(Date.now() - start)
      tickRef.current = setInterval(() => {
        setClockMs(Date.now() - start)
      }, 100)
    } else if (event?.race_started_at) {
      const start = new Date(event.race_started_at).getTime()
      setClockMs(Math.max(0, Date.now() - start))
    } else {
      setClockMs(0)
    }

    return () => clearInterval(tickRef.current)
  }, [event])

  const checkpointMap = useMemo(() => {
    const map = {}
    checkpoints.forEach(c => { map[c.id] = c })
    return map
  }, [checkpoints])

  const leaderboard = useMemo(() => {
    const grouped = {}

    lapEvents.forEach(le => {
      if (!le.bib_number) return
      if (!grouped[le.bib_number]) grouped[le.bib_number] = []
      grouped[le.bib_number].push(le)
    })

    const rows = Object.entries(grouped).map(([bib, competitorLaps]) => {
      const entry = entries[bib] || null

      const orderedSplits = competitorLaps
        .map(le => {
          const cp = checkpointMap[le.checkpoint_id]
          return {
            checkpoint_id: le.checkpoint_id,
            checkpoint_order: cp?.checkpoint_order ?? 9999,
            checkpoint_name: cp?.name ?? 'Checkpoint',
            elapsed_ms: le.elapsed_ms,
            captured_at: le.captured_at,
          }
        })
        .sort((a, b) => {
          if (a.checkpoint_order !== b.checkpoint_order) return a.checkpoint_order - b.checkpoint_order
          return a.elapsed_ms - b.elapsed_ms
        })

      const latest = orderedSplits[orderedSplits.length - 1] || null

      return {
        bib_number: bib,
        name: entry ? `${entry.first_name}${entry.last_name ? ' ' + entry.last_name : ''}` : null,
        team: entry?.team ?? null,
        teamColor: entry?.team ? teamMap[entry.team] : null,
        division: entry?.division ?? null,
        gender: entry?.gender ?? null,

        latest_checkpoint_order: latest?.checkpoint_order ?? 0,
        latest_checkpoint_name: latest?.checkpoint_name ?? null,
        latest_elapsed_ms: latest?.elapsed_ms ?? null,

        splits: orderedSplits,
      }
    })

    rows.sort((a, b) => {
      if (b.latest_checkpoint_order !== a.latest_checkpoint_order) {
        return b.latest_checkpoint_order - a.latest_checkpoint_order
      }
      if ((a.latest_elapsed_ms ?? Infinity) !== (b.latest_elapsed_ms ?? Infinity)) {
        return (a.latest_elapsed_ms ?? Infinity) - (b.latest_elapsed_ms ?? Infinity)
      }
      return String(a.bib_number).localeCompare(String(b.bib_number))
    })

    const leader = rows[0] || null

    return rows.map((r, idx) => ({
      ...r,
      place: idx + 1,
      gap: leader?.latest_elapsed_ms != null && r.latest_elapsed_ms != null
        ? r.latest_elapsed_ms - leader.latest_elapsed_ms
        : null,
    }))
  }, [lapEvents, entries, teamMap, checkpointMap])

  const divisions = useMemo(() => {
    const divs = new Set()
    leaderboard.forEach(r => {
      if (r.division && r.gender) divs.add(`${r.division} ${r.gender}`)
    })
    return ['Novice M', 'Novice F', 'Junior M', 'Junior F', 'Senior M', 'Senior F', 'Open M', 'Open F'].filter(d => divs.has(d))
  }, [leaderboard])

  const filtered = useMemo(() => {
    if (tab === 'all') return leaderboard
    const [div, gen] = tab.split(' ')
    return leaderboard
      .filter(r => r.division === div && r.gender === gen)
      .map((r, i) => ({ ...r, divPlace: i + 1 }))
  }, [leaderboard, tab])

  const teamScores = useMemo(() => {
    const byTeam = {}
    leaderboard
      .filter(r => r.team)
      .forEach(r => {
        if (!byTeam[r.team]) byTeam[r.team] = []
        byTeam[r.team].push(r.place)
      })

    return Object.entries(byTeam)
      .map(([team, places]) => {
        const top5 = places.sort((a, b) => a - b).slice(0, 5)
        return {
          team,
          color: teamMap[team],
          places: top5,
          total: top5.length === 5 ? top5.reduce((a, b) => a + b, 0) : null,
        }
      })
      .sort((a, b) => (a.total ?? 9999) - (b.total ?? 9999))
  }, [leaderboard, teamMap])

  const isLive = event?.status === 'active'

  const tabBtn = key => ({
    padding: '10px 16px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontFamily: fontHead,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tab === key ? C.orange : C.muted,
    borderBottom: tab === key ? `2px solid ${C.orange}` : '2px solid transparent',
  })

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, color: C.text, fontFamily: fontBody }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '14px 20px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 9, color: C.orange, letterSpacing: 3, fontFamily: fontHead, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
              AthletOS · Live Race
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, fontFamily: fontHead, letterSpacing: 0.5, marginBottom: 4 }}>
              {event?.name ?? '…'}
            </div>
            <div style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {event?.distance && <span>{event.distance}</span>}
              {event?.location && <span>📍 {event.location}</span>}
              {event?.event_date && (
                <span>
                  {new Date(event.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginLeft: 'auto' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: 2, fontFamily: fontHead, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
                Race Clock
              </div>
              <div style={{ fontSize: 30, fontWeight: 900, fontFamily: fontHead, color: event?.race_started_at ? C.text : C.muted, lineHeight: 1 }}>
                {fmtTime(clockMs)}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              {isLive && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 700, color: C.red, letterSpacing: 2, fontFamily: fontHead, textTransform: 'uppercase' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, display: 'inline-block', animation: 'livePulse 1.2s ease-in-out infinite' }} />
                  LIVE
                </span>
              )}
              {lastUpdate && <div style={{ fontSize: 10, color: C.muted }}>Updated {lastUpdate.toLocaleTimeString()}</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap' }}>
          {[
            { label: 'Seen racers', value: leaderboard.length, color: C.text },
            { label: 'Assigned splits', value: lapEvents.length, color: C.orange },
            { label: 'Entries', value: Object.keys(entries).length, color: C.muted },
            { label: 'Checkpoints', value: checkpoints.length, color: C.muted },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, minWidth: 160, padding: '10px 20px', borderRight: `1px solid ${C.border}`, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: fontHead, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', minWidth: 'max-content' }}>
          <button style={tabBtn('all')} onClick={() => setTab('all')}>All ({leaderboard.length})</button>
          {divisions.map(div => (
            <button key={div} style={tabBtn(div)} onClick={() => setTab(div)}>{div}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 20px', display: 'grid', gap: 16 }}>
        <ResultsTable
          rows={filtered}
          selTeam={selTeam}
          showDiv={tab === 'all'}
          expandedBib={expandedBib}
          onToggleExpand={bib => setExpandedBib(expandedBib === bib ? null : bib)}
        />

        {/* Optional lightweight team standings */}
        {teamScores.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, fontFamily: fontHead, fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: C.muted }}>
              Team Standings
            </div>
            <div style={{ padding: 12, display: 'grid', gap: 8 }}>
              {teamScores.map((s, i) => (
                <div key={s.team} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 90px 90px', alignItems: 'center', gap: 12, padding: '8px 10px', background: i % 2 === 0 ? 'transparent' : C.surface2 + '40', borderRadius: 8 }}>
                  <div style={{ fontFamily: fontHead, fontSize: 22, fontWeight: 900, color: s.color, textAlign: 'center' }}>{i + 1}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                    <span style={{ color: C.text, fontWeight: 600 }}>{s.team}</span>
                  </div>
                  <div style={{ color: C.muted, fontFamily: fontMono, fontSize: 11 }}>
                    {s.places.join(', ') || '—'}
                  </div>
                  <div style={{ color: i === 0 ? C.green : C.muted, fontFamily: fontHead, fontSize: 24, fontWeight: 900, textAlign: 'right' }}>
                    {s.total ?? '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', color: '#1f2937', fontSize: 11, padding: '24px 0', letterSpacing: 1, fontFamily: fontHead }}>
        POWERED BY ATHLETOS
      </div>

      <style>{`
        @keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  )
}