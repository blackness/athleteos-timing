/**
 * CVDashboard.jsx
 * 
 * CV-Powered Race Timing Dashboard for AthletOS
 * 
 * Drop this into your src/pages/ folder and add the route to App.jsx:
 * 
 *   import CVDashboard from './pages/CVDashboard'
 *   
 *   // Inside <Routes>:
 *   <Route path="/cv/:id" element={<ProtectedRoute><CVDashboard /></ProtectedRoute>} />
 * 
 * Then add a link from your Events page or FinishLine page to navigate here.
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

// ── Design tokens (matching your existing app) ──
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

// ── Helpers ──
function fmtTime(seconds) {
  if (!seconds || seconds <= 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`
}

function Pill({ children, color = C.green, filled = false }) {
  return (
    <span style={{
      fontFamily: fontHead, fontSize: 9, fontWeight: 700,
      color: filled ? '#000' : color,
      background: filled ? color : color + '18',
      padding: '2px 7px', borderRadius: 3, letterSpacing: 2,
      textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

// ── Simulated race data (replace with Supabase real-time subscription) ──
function useDemoRace() {
  const teams = [
    { name: 'Eastside TC', abbr: 'EST', color: C.green },
    { name: 'Westside HS', abbr: 'WST', color: C.blue },
    { name: 'Northside AC', abbr: 'NTH', color: C.yellow },
    { name: 'Central Prep', abbr: 'CTR', color: '#9d6aff' },
    { name: 'Riverside Run', abbr: 'RVR', color: C.red },
  ]

  const firstNames = ['Alex','Jordan','Morgan','Taylor','Casey','Riley','Quinn','Blake','Avery','Drew',
    'Sam','Jamie','Pat','Reese','Logan','Kai','Sage','Dylan','Charlie','Rowan',
    'Harper','Emery','Skyler','River','Phoenix','Dakota','Finley','Hayden','Jesse','Lane']
  const lastNames = ['Chen','Park','Williams','Rodriguez','Johnson','Kim','Davis','Martinez','Wilson',
    'Anderson','Thomas','Jackson','White','Harris','Clark','Lewis','Young','Hall','Allen','King',
    'Wright','Scott','Green','Baker','Hill','Adams','Nelson','Carter','Mitchell','Turner']

  const runners = []
  for (let i = 0; i < 35; i++) {
    const team = teams[i % 5]
    const fn = firstNames[Math.floor(Math.random() * firstNames.length)]
    const ln = lastNames[Math.floor(Math.random() * lastNames.length)]
    runners.push({
      bib: 100 + i + 1,
      name: `${fn} ${ln}`,
      team: team.name,
      teamAbbr: team.abbr,
      teamColor: team.color,
    })
  }
  return { teams, runners }
}

function generateResults(runners, count) {
  const sorted = [...runners].sort(() => Math.random() - 0.5)
  const results = []
  let base = 960 + Math.random() * 30
  for (let i = 0; i < Math.min(count, sorted.length); i++) {
    base += 1.5 + Math.random() * 8
    const r = sorted[i]
    results.push({
      place: i + 1,
      bib: r.bib,
      name: r.name,
      team: r.team,
      teamAbbr: r.teamAbbr,
      teamColor: r.teamColor,
      time: base,
      timeFmt: fmtTime(base),
      conf: (0.91 + Math.random() * 0.08).toFixed(2),
      flagged: Math.random() < 0.06,
      formScore: Math.max(40, Math.round(100 - i * 1.2 - Math.random() * 15)),
      trunkAngle: (7 - i * 0.12 - Math.random() * 3).toFixed(1),
      cadence: Math.round(178 - i * 0.4 - Math.random() * 6),
    })
  }
  return results
}

// Pre-generate a stable finish order so results don't shuffle on each tick
function buildFinishOrder(runners) {
  const shuffled = [...runners].sort(() => Math.random() - 0.5)
  let base = 960 + Math.random() * 30
  return shuffled.map((r, i) => {
    base += 1.5 + Math.random() * 8
    return {
      place: i + 1,
      bib: r.bib,
      name: r.name,
      team: r.team,
      teamAbbr: r.teamAbbr,
      teamColor: r.teamColor,
      time: base,
      timeFmt: fmtTime(base),
      conf: (0.91 + Math.random() * 0.08).toFixed(2),
      flagged: Math.random() < 0.06,
      formScore: Math.max(40, Math.round(100 - i * 1.2 - Math.random() * 15)),
      trunkAngle: (7 - i * 0.12 - Math.random() * 3).toFixed(1),
      cadence: Math.round(178 - i * 0.4 - Math.random() * 6),
    }
  })
}

function computeTeamScores(results, teams) {
  const scores = {}
  teams.forEach(t => { scores[t.name] = { team: t, places: [], total: 0 } })
  results.forEach(r => {
    if (scores[r.team] && scores[r.team].places.length < 5) {
      scores[r.team].places.push(r.place)
      scores[r.team].total += r.place
    }
  })
  return Object.values(scores)
    .filter(s => s.places.length > 0)
    .sort((a, b) => {
      if (a.places.length !== b.places.length) return b.places.length - a.places.length
      return a.total - b.total
    })
}

// ═══════════════════════════════════════════════════════════════
// PERSISTENT RACE STATE (survives component remounts / navigation)
// ═══════════════════════════════════════════════════════════════

const raceState = {
  isLive: false,
  elapsed: 0,
  finishOrder: null,
  revealedCount: 0,
  raceData: null,
  timerId: null,
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function CVDashboard() {
  const { id } = useParams()
  const navigate = useNavigate()

  // Initialize race data once
  if (!raceState.raceData) {
    raceState.raceData = useDemoRace()
  }
  const race = raceState.raceData

  // Build stable finish order once
  if (!raceState.finishOrder) {
    raceState.finishOrder = buildFinishOrder(race.runners)
  }

  const [results, setResults] = useState(
    () => raceState.finishOrder.slice(0, raceState.revealedCount)
  )
  const [isLive, setIsLive] = useState(raceState.isLive)
  const [raceTime, setRaceTime] = useState(() => {
    const m = Math.floor(raceState.elapsed / 60)
    const s = raceState.elapsed % 60
    return raceState.elapsed > 0 ? `${m}:${s < 10 ? '0' : ''}${s}` : '0:00'
  })
  const [tab, setTab] = useState('results')
  const [selectedTeam, setSelectedTeam] = useState(null)

  const checkpoints = [
    { id: 1, label: '800m', status: 'active', runners: 35, volunteers: 2 },
    { id: 2, label: '1 Mile', status: 'active', runners: 28, volunteers: 1 },
    { id: 3, label: '1.5 Mi', status: 'active', runners: 18, volunteers: 3 },
    { id: 4, label: '2 Mile', status: 'waiting', runners: 0, volunteers: 1 },
  ]

  // Resume the timer if race was already live when we navigated back
  useEffect(() => {
    if (raceState.isLive && !raceState.timerId) {
      startTicker()
    }
    return () => {} // don't clear on unmount — let it keep running
  }, [])

  function startTicker() {
    if (raceState.timerId) clearInterval(raceState.timerId)

    raceState.timerId = setInterval(() => {
      raceState.elapsed += 1
      const m = Math.floor(raceState.elapsed / 60)
      const s = raceState.elapsed % 60
      setRaceTime(`${m}:${s < 10 ? '0' : ''}${s}`)

      // Reveal new finishers (append only — stable order)
      if (raceState.elapsed > 15 && raceState.revealedCount < raceState.finishOrder.length) {
        const add = Math.floor(Math.random() * 3) + 1
        raceState.revealedCount = Math.min(
          raceState.finishOrder.length,
          raceState.revealedCount + add
        )
        setResults(raceState.finishOrder.slice(0, raceState.revealedCount))
      }

      // End race when all finished
      if (raceState.revealedCount >= raceState.finishOrder.length && raceState.elapsed > 45) {
        clearInterval(raceState.timerId)
        raceState.timerId = null
        raceState.isLive = false
        setIsLive(false)
      }
    }, 1000)
  }

  function startRace() {
    if (raceState.isLive) return

    // Reset for a new race
    raceState.isLive = true
    raceState.elapsed = 0
    raceState.revealedCount = 0
    raceState.finishOrder = buildFinishOrder(race.runners)

    setIsLive(true)
    setResults([])
    setRaceTime('0:00')

    startTicker()
  }

  // Cleanup only when leaving the app entirely
  useEffect(() => {
    return () => {
      // Keep timer running on navigation — only clear if component tree is destroyed
    }
  }, [])

  const teamScores = computeTeamScores(results, race.teams)
  const flaggedCount = results.filter(r => r.flagged).length

  // ── Styles ──
  const headerBtn = (active) => ({
    fontFamily: fontHead, fontSize: 11, fontWeight: 700,
    letterSpacing: 1.5, textTransform: 'uppercase',
    padding: '8px 18px', borderRadius: 6, border: 'none',
    cursor: 'pointer', transition: 'all 0.15s',
    background: active ? C.green : 'transparent',
    color: active ? '#000' : C.muted,
    borderBottom: active ? 'none' : `1px solid transparent`,
  })

  const tabBtn = (key) => ({
    fontFamily: fontHead, fontSize: 12, fontWeight: 700,
    letterSpacing: 1.5, textTransform: 'uppercase',
    padding: '10px 20px', background: 'transparent', border: 'none',
    borderBottom: tab === key ? `2px solid ${C.green}` : '2px solid transparent',
    color: tab === key ? C.green : C.muted,
    cursor: 'pointer', transition: 'all 0.15s',
  })

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', color: C.text }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 56,
        background: C.surface, borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'transparent', border: `1px solid ${C.border}`,
              color: C.muted, borderRadius: 6, padding: '5px 10px',
              fontFamily: fontHead, fontSize: 12, fontWeight: 700,
              letterSpacing: 1, cursor: 'pointer',
            }}
          >← Events</button>

          <div>
            <span style={{ fontFamily: fontHead, fontSize: 10, color: C.green, letterSpacing: 3, fontWeight: 700 }}>
              CV TIMING
            </span>
            <span style={{ fontFamily: fontHead, fontSize: 16, fontWeight: 800, color: C.text, marginLeft: 10, letterSpacing: 0.5 }}>
              Event #{id}
            </span>
          </div>

          {isLive && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontFamily: fontMono, fontSize: 10, color: C.red, fontWeight: 700,
              animation: 'livePulse 1.2s infinite',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, display: 'inline-block' }} />
              LIVE
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => navigate(`/finish/${id}`)}
            style={{
              ...headerBtn(false),
              border: `1px solid ${C.border}`,
            }}
          >Manual Backup</button>
          <button
            onClick={startRace}
            disabled={isLive}
            style={headerBtn(!isLive)}
          >{isLive ? 'Race Active...' : 'Start Demo'}</button>
        </div>
      </div>

      <style>{`@keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>

      {/* ── Stats strip ── */}
      <div style={{
        display: 'flex', borderBottom: `1px solid ${C.border}`,
      }}>
        {[
          { label: 'Race Clock', value: raceTime, color: C.green },
          { label: 'Finishers', value: `${results.length}`, color: C.blue },
          { label: 'Flagged', value: `${flaggedCount}`, color: flaggedCount > 0 ? C.yellow : C.muted },
          { label: 'Checkpoints', value: `${checkpoints.filter(c => c.status === 'active').length}/${checkpoints.length}`, color: C.green },
          { label: 'Status', value: isLive ? 'LIVE' : 'IDLE', color: isLive ? C.red : C.muted },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, padding: '10px 16px', background: C.surface,
            borderRight: `1px solid ${C.border}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <span style={{ fontFamily: fontHead, fontSize: 8, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' }}>{s.label}</span>
            <span style={{ fontFamily: fontHead, fontSize: 20, fontWeight: 900, color: s.color, marginTop: 2, lineHeight: 1 }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* ── Checkpoint bar ── */}
      <div style={{ display: 'flex', gap: 1, background: C.border }}>
        {checkpoints.map(cp => (
          <div key={cp.id} style={{
            flex: 1, padding: '8px 14px', background: C.surface,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <span style={{ fontFamily: fontHead, fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: 0.5 }}>{cp.label}</span>
              <span style={{ fontFamily: fontBody, fontSize: 10, color: C.muted, marginLeft: 8 }}>{cp.runners} detected</span>
            </div>
            <Pill color={cp.status === 'active' ? C.green : C.muted} filled={cp.status === 'active'}>
              {cp.status === 'active' ? 'Live' : 'Wait'}
            </Pill>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, paddingLeft: 20, background: C.surface }}>
        {['results', 'teams', 'form'].map(key => (
          <button key={key} onClick={() => setTab(key)} style={tabBtn(key)}>
            {key === 'results' ? `Results (${results.length})` : key === 'teams' ? 'Team Scoring' : 'Form Analysis'}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ padding: '16px 20px', maxWidth: 1100, margin: '0 auto' }}>

        {/* RESULTS TAB */}
        {tab === 'results' && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {results.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', fontFamily: fontBody, color: C.muted, fontSize: 14 }}>
                {isLive ? 'Waiting for runners to cross the finish line...' : 'Start a race to see live CV-powered results'}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: fontBody, fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['#', 'Bib', 'Name', 'Team', 'Time', 'Conf', 'Form', 'Status'].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: 'left',
                        fontFamily: fontHead, fontSize: 9, fontWeight: 700,
                        letterSpacing: 2, textTransform: 'uppercase', color: C.muted,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={r.bib} style={{
                      borderBottom: `1px solid ${C.border}10`,
                      background: selectedTeam === r.team ? C.green + '10' : (i % 2 === 0 ? 'transparent' : C.surface2 + '40'),
                    }}>
                      <td style={{ padding: '7px 12px', fontWeight: r.place <= 3 ? 800 : 400, color: r.place <= 3 ? C.green : C.text, fontFamily: fontMono, fontSize: 12 }}>{r.place}</td>
                      <td style={{ padding: '7px 12px', color: C.muted, fontFamily: fontMono, fontSize: 12 }}>{r.bib}</td>
                      <td style={{ padding: '7px 12px', fontWeight: 500, color: C.text }}>{r.name}</td>
                      <td style={{ padding: '7px 12px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.teamColor, flexShrink: 0, display: 'inline-block' }} />
                          <span style={{ color: C.muted, fontSize: 12 }}>{r.teamAbbr}</span>
                        </span>
                      </td>
                      <td style={{ padding: '7px 12px', fontWeight: 700, fontFamily: fontMono, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{r.timeFmt}</td>
                      <td style={{ padding: '7px 12px', fontFamily: fontMono, fontSize: 11, color: parseFloat(r.conf) > 0.95 ? C.green : C.yellow }}>{(r.conf * 100).toFixed(0)}%</td>
                      <td style={{ padding: '7px 12px', fontFamily: fontMono, fontSize: 12, fontWeight: 600, color: r.formScore > 75 ? C.green : r.formScore > 55 ? C.yellow : C.red }}>{r.formScore}</td>
                      <td style={{ padding: '7px 12px' }}>
                        {r.flagged ? <Pill color={C.yellow}>Review</Pill> : <Pill color={C.green}>OK</Pill>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TEAMS TAB */}
        {tab === 'teams' && (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontFamily: fontHead, fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
                Team Standings
              </div>
              {teamScores.map((s, i) => (
                <button
                  key={s.team.name}
                  onClick={() => setSelectedTeam(selectedTeam === s.team.name ? null : s.team.name)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    background: selectedTeam === s.team.name ? C.surface2 : C.surface,
                    border: `1px solid ${selectedTeam === s.team.name ? s.team.color + '50' : C.border}`,
                    borderRadius: 8, cursor: 'pointer', width: '100%', textAlign: 'left',
                  }}
                >
                  <span style={{ fontFamily: fontHead, fontSize: 22, fontWeight: 900, color: s.team.color, width: 28, textAlign: 'center' }}>{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: C.text }}>{s.team.name}</div>
                    <div style={{ fontFamily: fontMono, fontSize: 10, color: C.muted }}>{s.places.length}/5 scored — {s.places.join(', ') || '—'}</div>
                  </div>
                  <span style={{ fontFamily: fontHead, fontSize: 24, fontWeight: 900, color: i === 0 ? C.green : C.muted }}>{s.total || '—'}</span>
                </button>
              ))}
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
              {results.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center', fontFamily: fontBody, color: C.muted }}>No results yet</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: fontBody, fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {['#', 'Bib', 'Name', 'Team', 'Time'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontFamily: fontHead, fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: C.muted }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={r.bib} style={{
                        borderBottom: `1px solid ${C.border}10`,
                        background: selectedTeam === r.team ? C.green + '10' : 'transparent',
                      }}>
                        <td style={{ padding: '6px 12px', fontFamily: fontMono, fontSize: 12 }}>{r.place}</td>
                        <td style={{ padding: '6px 12px', fontFamily: fontMono, fontSize: 12, color: C.muted }}>{r.bib}</td>
                        <td style={{ padding: '6px 12px', fontWeight: 500 }}>{r.name}</td>
                        <td style={{ padding: '6px 12px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.teamColor, display: 'inline-block' }} />
                            <span style={{ color: C.muted, fontSize: 12 }}>{r.teamAbbr}</span>
                          </span>
                        </td>
                        <td style={{ padding: '6px 12px', fontFamily: fontMono, fontSize: 12, fontWeight: 700 }}>{r.timeFmt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* FORM ANALYSIS TAB */}
        {tab === 'form' && (
          results.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', fontFamily: fontBody, color: C.muted }}>
              Form data populates as runners finish...
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {results.slice(0, 15).map(r => {
                const fc = r.formScore > 75 ? C.green : r.formScore > 55 ? C.yellow : C.red
                return (
                  <div key={r.bib} style={{
                    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontFamily: fontBody, fontSize: 14, fontWeight: 600, color: C.text }}>{r.name}</div>
                        <div style={{ fontFamily: fontMono, fontSize: 10, color: C.muted }}>Bib {r.bib} — {r.teamAbbr} — {r.timeFmt}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: fontHead, fontSize: 28, fontWeight: 900, color: fc, lineHeight: 1 }}>{r.formScore}</div>
                        <div style={{ fontFamily: fontHead, fontSize: 8, color: C.muted, letterSpacing: 1.5 }}>FORM</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      {[
                        { label: 'Lean', value: `${r.trunkAngle}°`, ok: parseFloat(r.trunkAngle) > 3 },
                        { label: 'Cadence', value: `${r.cadence}`, ok: r.cadence >= 170 },
                        { label: 'Place', value: `#${r.place}`, ok: r.place <= 10 },
                      ].map(m => (
                        <div key={m.label} style={{ background: C.surface2, borderRadius: 6, padding: '5px 8px', textAlign: 'center' }}>
                          <div style={{ fontFamily: fontHead, fontSize: 8, color: C.muted, letterSpacing: 1 }}>{m.label}</div>
                          <div style={{ fontFamily: fontMono, fontSize: 14, fontWeight: 700, color: m.ok ? C.green : C.yellow, marginTop: 2 }}>{m.value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ height: 3, background: C.surface2, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${r.formScore}%`, background: `linear-gradient(90deg, ${C.red}, ${C.yellow}, ${C.green})`, borderRadius: 2 }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )
}
