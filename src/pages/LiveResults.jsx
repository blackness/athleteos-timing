/**
 * LiveResults.jsx
 *
 * Route: /results/:id  (public — no auth required)
 *
 * CV Dashboard-style results with:
 *  - Division tabs (All, Novice M/F, Junior M/F, Senior M/F, Open M/F)
 *  - Team scoring tab
 *  - Real-time Supabase subscription
 *  - Gap to leader, medal places, team color dots
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ── Design tokens (matching CVDashboard) ──────────────────
const C = {
  bg:       '#080b0f',
  surface:  '#0e1318',
  surface2: '#141920',
  border:   '#1e2730',
  text:     '#f0f4f8',
  muted:    '#4a5568',
  orange:   '#f97316',
  blue:     '#3b82f6',
  green:    '#10b981',
  red:      '#ef4444',
  yellow:   '#eab308',
}

const fontHead = "'Barlow Condensed', sans-serif"
const fontBody = "'Barlow', sans-serif"
const fontMono = "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace"

const TEAM_COLORS = [C.green, C.blue, C.yellow, '#9d6aff', C.red, '#f97316', '#06b6d4', '#ec4899']

function fmtTime(ms) {
  if (!ms) return '—'
  const h  = Math.floor(ms / 3600000)
  const m  = Math.floor((ms % 3600000) / 60000)
  const s  = Math.floor((ms % 60000) / 1000)
  const cs = Math.floor((ms % 1000) / 10)
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`
}

function fmtGap(ms) {
  if (!ms || ms <= 0) return null
  const s = ms / 1000
  return s < 60 ? `+${s.toFixed(1)}s` : `+${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}`
}

function ResultsTable({ rows, selTeam, showDiv }) {
  if (rows.length === 0) {
    return (
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '48px 0', textAlign: 'center', color: C.muted, fontFamily: fontBody, fontSize: 14 }}>
        Waiting for finishers…
      </div>
    )
  }
  const medals = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' }
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: fontBody, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['#', 'Bib', 'Athlete', 'Team', showDiv ? 'Div' : null, 'Time', 'Gap'].filter(Boolean).map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontFamily: fontHead, fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: C.muted }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isPending = !r.bib_number
            const medal = medals[r.divPlace ?? r.place]
            return (
              <tr key={r.id} style={{
                borderBottom: `1px solid ${C.border}18`,
                background: selTeam && r.team === selTeam ? C.green + '12' : i % 2 === 0 ? 'transparent' : C.surface2 + '40',
                opacity: isPending ? 0.4 : 1,
              }}>
                <td style={{ padding: '7px 12px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: medal ?? C.surface2, fontSize: 11, fontWeight: 800, fontFamily: fontHead, color: medal ? '#000' : C.muted }}>
                    {r.divPlace ?? r.place}
                  </span>
                </td>
                <td style={{ padding: '7px 12px', color: C.muted, fontFamily: fontMono, fontSize: 12 }}>{r.bib_number ?? '—'}</td>
                <td style={{ padding: '7px 12px', fontWeight: 500, color: r.name ? C.text : C.muted, fontStyle: isPending ? 'italic' : 'normal' }}>
                  {r.name ?? (isPending ? 'awaiting bib' : 'not in roster')}
                </td>
                <td style={{ padding: '7px 12px' }}>
                  {r.team ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: r.teamColor ?? C.muted, flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ color: C.muted, fontSize: 12 }}>{r.team}</span>
                    </span>
                  ) : <span style={{ color: C.muted }}>—</span>}
                </td>
                {showDiv && (
                  <td style={{ padding: '7px 12px' }}>
                    {r.division && r.gender
                      ? <span style={{ fontSize: 9, fontFamily: fontHead, fontWeight: 700, letterSpacing: 1, padding: '2px 6px', borderRadius: 3, background: C.surface2, color: C.muted, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{r.division} {r.gender}</span>
                      : <span style={{ color: C.muted }}>—</span>}
                  </td>
                )}
                <td style={{ padding: '7px 12px', fontWeight: 700, fontFamily: fontMono, fontSize: 12, fontVariantNumeric: 'tabular-nums', color: C.text }}>{fmtTime(r.time_ms)}</td>
                <td style={{ padding: '7px 12px', fontFamily: fontMono, fontSize: 11, color: r.gap === 0 ? C.green : C.muted, fontVariantNumeric: 'tabular-nums' }}>
                  {r.gap === 0 ? 'Leader' : r.gap ? fmtGap(r.gap) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function LiveResults() {
  const { id: eventId } = useParams()
  const [event,      setEvent]      = useState(null)
  const [finishes,   setFinishes]   = useState([])
  const [entries,    setEntries]    = useState({})
  const [teamMap,    setTeamMap]    = useState({})
  const [tab,        setTab]        = useState('all')
  const [teamTab,    setTeamTab]    = useState(false)
  const [selTeam,    setSelTeam]    = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)

  useEffect(() => {
    if (!eventId) return
    supabase.from('race_events').select('*').eq('id', eventId).single().then(({ data }) => setEvent(data))
    supabase.from('event_entries').select('*').eq('event_id', eventId).then(({ data }) => {
      const map = {}, teams = {}
      let ci = 0
      data?.forEach(e => {
        map[e.bib_number] = e
        if (e.team && !teams[e.team]) teams[e.team] = TEAM_COLORS[ci++ % TEAM_COLORS.length]
      })
      setEntries(map); setTeamMap(teams)
    })
    supabase.from('race_finishes').select('*').eq('event_id', eventId).order('place', { ascending: true })
      .then(({ data }) => { setFinishes(data ?? []); if (data?.length) setLastUpdate(new Date()) })
    const ch = supabase.channel(`lr:${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'race_finishes', filter: `event_id=eq.${eventId}` }, p => {
        setLastUpdate(new Date())
        if (p.eventType === 'INSERT') setFinishes(prev => prev.find(f => f.id === p.new.id) ? prev : [...prev, p.new].sort((a,b) => a.place - b.place))
        else if (p.eventType === 'UPDATE') setFinishes(prev => prev.map(f => f.id === p.new.id ? p.new : f))
      }).subscribe()
    return () => supabase.removeChannel(ch)
  }, [eventId])

  const enriched = useMemo(() => {
    const leaderMs = finishes.find(f => f.bib_number)?.time_ms ?? null
    return finishes.map(f => {
      const entry = f.bib_number ? entries[f.bib_number] : null
      return { ...f, entry, name: entry ? `${entry.first_name}${entry.last_name ? ' '+entry.last_name : ''}` : null, team: entry?.team ?? null, teamColor: entry?.team ? teamMap[entry.team] : null, division: entry?.division ?? null, gender: entry?.gender ?? null, gap: leaderMs != null && f.time_ms != null ? f.time_ms - leaderMs : null }
    })
  }, [finishes, entries, teamMap])

  const divisions = useMemo(() => {
    const divs = new Set()
    enriched.forEach(r => { if (r.division && r.gender) divs.add(`${r.division} ${r.gender}`) })
    return ['Novice M','Novice F','Junior M','Junior F','Senior M','Senior F','Open M','Open F'].filter(d => divs.has(d))
  }, [enriched])

  const filtered = useMemo(() => {
    if (tab === 'all') return enriched
    const [div, gen] = tab.split(' ')
    return enriched.filter(r => r.division === div && r.gender === gen).map((r, i) => ({ ...r, divPlace: i + 1 }))
  }, [enriched, tab])

  const teamScores = useMemo(() => {
    const byTeam = {}
    enriched.filter(r => r.bib_number && r.team).forEach(r => { if (!byTeam[r.team]) byTeam[r.team] = []; byTeam[r.team].push(r.place) })
    return Object.entries(byTeam).map(([team, places]) => {
      const top5 = places.sort((a,b) => a-b).slice(0,5)
      return { team, color: teamMap[team], places: top5, total: top5.length === 5 ? top5.reduce((a,b) => a+b,0) : null }
    }).sort((a,b) => (a.total ?? 9999) - (b.total ?? 9999))
  }, [enriched, teamMap])

  const isLive = event?.status === 'active'
  const tabBtn = (key, isTeam = false) => ({
    padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
    fontFamily: fontHead, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
    color: (isTeam ? teamTab : tab === key && !teamTab) ? (isTeam ? C.green : C.orange) : C.muted,
    borderBottom: (isTeam ? teamTab : tab === key && !teamTab) ? `2px solid ${isTeam ? C.green : C.orange}` : '2px solid transparent',
  })

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, color: C.text, fontFamily: fontBody }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '14px 20px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 9, color: C.orange, letterSpacing: 3, fontFamily: fontHead, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>AthletOS · Race Results</div>
            <div style={{ fontSize: 24, fontWeight: 900, fontFamily: fontHead, letterSpacing: 0.5, marginBottom: 4 }}>{event?.name ?? '…'}</div>
            <div style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {event?.distance && <span>{event.distance}</span>}
              {event?.location && <span>📍 {event.location}</span>}
              {event?.event_date && <span>{new Date(event.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
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

      {/* Stats */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex' }}>
          {[
            { label: 'Finishers', value: finishes.filter(f=>f.bib_number).length, color: C.text },
            { label: 'Pending bib', value: finishes.filter(f=>!f.bib_number).length, color: finishes.filter(f=>!f.bib_number).length > 0 ? C.yellow : C.muted },
            { label: 'Entries', value: Object.keys(entries).length, color: C.muted },
            { label: 'Teams', value: Object.keys(teamMap).length, color: C.muted },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, padding: '10px 20px', borderRight: `1px solid ${C.border}`, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: fontHead, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', minWidth: 'max-content' }}>
          <button style={tabBtn('all')} onClick={() => { setTab('all'); setTeamTab(false) }}>All ({enriched.length})</button>
          {divisions.map(div => (
            <button key={div} style={tabBtn(div)} onClick={() => { setTab(div); setTeamTab(false) }}>{div}</button>
          ))}
          <button style={tabBtn('teams', true)} onClick={() => setTeamTab(true)}>Team Scoring</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 20px' }}>
        {teamTab ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,300px) 1fr', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontFamily: fontHead, fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Team Standings</div>
              {teamScores.map((s, i) => (
                <button key={s.team} onClick={() => setSelTeam(selTeam === s.team ? null : s.team)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: selTeam === s.team ? C.surface2 : C.surface, border: `1px solid ${selTeam === s.team ? s.color+'50' : C.border}`, borderRadius: 8, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                  <span style={{ fontFamily: fontHead, fontSize: 22, fontWeight: 900, color: s.color, width: 28, textAlign: 'center' }}>{i+1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                      <span style={{ fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: C.text }}>{s.team}</span>
                    </div>
                    <div style={{ fontFamily: fontMono, fontSize: 10, color: C.muted, marginTop: 2 }}>{s.places.length}/5 scored · {s.places.join(', ') || '—'}</div>
                  </div>
                  <span style={{ fontFamily: fontHead, fontSize: 24, fontWeight: 900, color: i === 0 ? C.green : C.muted }}>{s.total ?? '—'}</span>
                </button>
              ))}
              {teamScores.length === 0 && <div style={{ color: C.muted, fontSize: 13, padding: '20px 0' }}>No team data yet</div>}
            </div>
            <ResultsTable rows={enriched} selTeam={selTeam} showDiv />
          </div>
        ) : (
          <ResultsTable rows={filtered} selTeam={selTeam} showDiv={tab === 'all'} />
        )}
      </div>

      <div style={{ textAlign: 'center', color: '#1f2937', fontSize: 11, padding: '24px 0', letterSpacing: 1, fontFamily: fontHead }}>POWERED BY ATHLETOS</div>
      <style>{`@keyframes livePulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  )
}
