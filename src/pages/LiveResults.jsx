import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getRaceElapsedMs, formatRaceClock } from '../lib/raceClock'
import AdjustmentMarker from '../components/AdjustmentMarker'
import {
  groupAdjustmentsByEntryOrBib,
  getAdjustmentKey,
  sumAdjustments,
} from '../lib/raceAdjustments'

const THEMES = {
  dark: {
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
    dim: '#2d3748',
    footer: '#1f2937',
    medalFallback: '#1a2230',
  },
  light: {
    bg: '#f8fafc',
    surface: '#ffffff',
    surface2: '#f1f5f9',
    border: '#cbd5e1',
    text: '#0f172a',
    muted: '#64748b',
    orange: '#ea580c',
    blue: '#2563eb',
    green: '#16a34a',
    red: '#dc2626',
    yellow: '#d97706',
    dim: '#94a3b8',
    footer: '#94a3b8',
    medalFallback: '#e2e8f0',
  },
}

const fontHead = "'Barlow Condensed', sans-serif"
const fontBody = "'Barlow', sans-serif"
const fontMono = "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace"

const DESKTOP_NAME_COL_WIDTH = 130
const MOBILE_NAME_COL_WIDTH = 96
const THEME_STORAGE_KEY = 'live_results_theme'

function fmtTime(ms) {
  if (ms == null) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const cs = Math.floor((ms % 1000) / 10)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function formatCountdown(ms) {
  if (ms == null || ms <= 0) return '00:00:00'

  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getDisplayName(entry) {
  if (!entry) return null
  return `${entry.first_name ?? ''}${entry.last_name ? ` ${entry.last_name}` : ''}`.trim() || null
}

function getDisplayNameForBib(entriesForBib, bib) {
  if (!entriesForBib?.length) return `Bib ${bib}`

  const first = entriesForBib[0]
  const count = entriesForBib.length
  const team = first?.team || null
  const firstName = getDisplayName(first)

  if (count > 1 && team) return team
  if (firstName) return firstName
  if (team) return team
  return `Bib ${bib}`
}

function getPrimaryEntry(entriesForBib) {
  return entriesForBib?.[0] || null
}

function normalizeGender(value) {
  const v = String(value || '').trim().toLowerCase()

  if (!v) return 'Unspecified'
  if (['m', 'male', 'man', 'men', 'boy'].includes(v)) return 'Men'
  if (['f', 'female', 'woman', 'women', 'girl'].includes(v)) return 'Women'
  if (['nb', 'non-binary', 'nonbinary', 'non binary'].includes(v)) return 'Non-Binary'
  return 'Other'
}

function emptyStateStyle(C) {
  return {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: '40px 0',
    textAlign: 'center',
    color: C.muted,
    fontFamily: fontBody,
    fontSize: 13,
  }
}

function thBase(C) {
  return {
    padding: '7px 10px',
    textAlign: 'left',
    fontFamily: fontHead,
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: C.muted,
    whiteSpace: 'nowrap',
    background: C.surface,
    borderBottom: `1px solid ${C.border}`,
    cursor: 'pointer',
    userSelect: 'none',
  }
}

function tdBase(C, mono = false) {
  return {
    padding: '6px 10px',
    fontFamily: mono ? fontMono : fontBody,
    fontSize: 11,
    color: C.text,
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
    background: 'inherit',
  }
}

function stickyHeader(left = undefined, z = 3, extra = {}) {
  return {
    position: 'sticky',
    top: 0,
    zIndex: z,
    ...(left != null ? { left } : {}),
    ...extra,
  }
}

function stickyCell(left, bg, z = 2) {
  return {
    position: 'sticky',
    left,
    zIndex: z,
    background: bg,
  }
}

function sortIndicator(active, dir) {
  if (!active) return ' ↕'
  return dir === 'asc' ? ' ↑' : ' ↓'
}

function compareValues(a, b, dir = 'asc', type = 'string') {
  const mul = dir === 'asc' ? 1 : -1

  if (type === 'number') {
    const av = a == null || a === '' ? Infinity : Number(a)
    const bv = b == null || b === '' ? Infinity : Number(b)

    if (av < bv) return -1 * mul
    if (av > bv) return 1 * mul
    return 0
  }

  const av = String(a ?? '')
  const bv = String(b ?? '')
  return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }) * mul
}

function ThemeToggle({ theme, setTheme, C }) {
  const btn = active => ({
    padding: '6px 10px',
    borderRadius: 999,
    border: `1px solid ${C.border}`,
    background: active ? C.surface2 : 'transparent',
    color: active ? C.text : C.muted,
    cursor: 'pointer',
    fontFamily: fontHead,
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  })

  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <button style={btn(theme === 'light')} onClick={() => setTheme('light')}>
        ☀ Light
      </button>
      <button style={btn(theme === 'dark')} onClick={() => setTheme('dark')}>
        🌙 Dark
      </button>
    </div>
  )
}

function TeamStandingsCard({ standings, C, isMobile }) {
  const th = {
    padding: isMobile ? '8px 10px' : '10px 12px',
    textAlign: 'left',
    fontFamily: fontHead,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: C.muted,
    borderBottom: `1px solid ${C.border}`,
    background: C.surface,
    whiteSpace: 'nowrap',
  }

  const td = {
    padding: isMobile ? '8px 10px' : '10px 12px',
    fontFamily: fontBody,
    fontSize: 12,
    color: C.text,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
  }

  return (
    <div
      style={{
        marginBottom: 16,
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: isMobile ? '10px 12px' : '12px 14px',
          borderBottom: `1px solid ${C.border}`,
          fontFamily: fontHead,
          fontWeight: 800,
          fontSize: 11,
          letterSpacing: 1.6,
          textTransform: 'uppercase',
          color: C.orange,
        }}
      >
        Team Standings
      </div>

      {standings.complete.length === 0 && standings.incomplete.length === 0 ? (
        <div style={{ padding: 16, color: C.muted, fontSize: 13 }}>
          No team results yet.
        </div>
      ) : (
        <>
          {standings.complete.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 520 : 640 }}>
                <thead>
                  <tr>
                    <th style={th}>Place</th>
                    <th style={th}>Team</th>
                    <th style={th}>Score</th>
                    <th style={th}>Finishers</th>
                    <th style={th}>Scorers</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.complete.map((team, idx) => (
                    <tr key={team.team}>
                      <td style={td}>{idx + 1}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{team.team}</td>
                      <td style={{ ...td, fontFamily: fontMono, fontWeight: 700 }}>{team.score}</td>
                      <td style={{ ...td, fontFamily: fontMono }}>{team.finishers}</td>
                      <td style={{ ...td, fontFamily: fontMono }}>
                        {team.scorers.map(r => r.place).filter(Boolean).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {standings.incomplete.length > 0 && (
            <div style={{ padding: isMobile ? '10px 12px' : '12px 14px' }}>
              <div
                style={{
                  fontFamily: fontHead,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  color: C.muted,
                  marginBottom: 8,
                }}
              >
                Incomplete Teams
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {standings.incomplete.map(team => (
                  <div
                    key={team.team}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 999,
                      border: `1px solid ${C.border}`,
                      color: C.muted,
                      fontSize: 12,
                      background: C.surface2,
                    }}
                  >
                    {team.team} · {team.finishers} finisher{team.finishers === 1 ? '' : 's'}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ResultsTable({ rows, displayCheckpoints, sortConfig, onSort, C, isMobile, nameColWidth }) {
  if (!rows.length) {
    return <div style={emptyStateStyle(C)}>No racers in this segment yet…</div>
  }

  const medals = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' }
  const tableMinWidth = isMobile ? 860 : 1080
  const checkpointMinWidth = isMobile ? 88 : 120
  const bibMinWidth = isMobile ? 60 : 72
  const finishMinWidth = isMobile ? 96 : 120
  const waveMinWidth = isMobile ? 72 : 90
  const teamMinWidth = isMobile ? 96 : 140

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: tableMinWidth }}>
        <thead>
          <tr>
            <th onClick={() => onSort('place', 'number')} style={{ ...thBase(C), ...stickyHeader(undefined, 5), minWidth: 64 }}>
              Place{sortIndicator(sortConfig.key === 'place', sortConfig.dir)}
            </th>

            <th
              onClick={() => onSort('name', 'string')}
              style={{ ...thBase(C), ...stickyHeader(64, 6), left: 64, minWidth: nameColWidth, maxWidth: nameColWidth, width: nameColWidth }}
            >
              Name{sortIndicator(sortConfig.key === 'name', sortConfig.dir)}
            </th>

            <th onClick={() => onSort('team', 'string')} style={{ ...thBase(C), ...stickyHeader(undefined, 4), minWidth: teamMinWidth }}>
              Team{sortIndicator(sortConfig.key === 'team', sortConfig.dir)}
            </th>

            <th onClick={() => onSort('bib_number', 'number')} style={{ ...thBase(C), ...stickyHeader(undefined, 4), minWidth: bibMinWidth }}>
              Bib{sortIndicator(sortConfig.key === 'bib_number', sortConfig.dir)}
            </th>

            <th onClick={() => onSort('time_ms', 'number')} style={{ ...thBase(C), ...stickyHeader(undefined, 4), minWidth: finishMinWidth }}>
              Finish Time{sortIndicator(sortConfig.key === 'time_ms', sortConfig.dir)}
            </th>

            {displayCheckpoints.map(cp => (
              <th
                key={cp.id}
                onClick={() => onSort(`cp:${cp.id}`, 'number')}
                style={{ ...thBase(C), ...stickyHeader(undefined, 4), minWidth: checkpointMinWidth }}
              >
                {cp.name || cp.display_name || cp.label || (cp.isFinish ? 'Finish' : `CP${cp.checkpoint_order}`)}
                {sortIndicator(sortConfig.key === `cp:${cp.id}`, sortConfig.dir)}
              </th>
            ))}

            <th onClick={() => onSort('wave_code', 'string')} style={{ ...thBase(C), ...stickyHeader(undefined, 4), minWidth: waveMinWidth }}>
              Wave{sortIndicator(sortConfig.key === 'wave_code', sortConfig.dir)}
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r, i) => {
            const medal = r.is_finished ? medals[r.place] : null
            const rowBg = i % 2 === 0 ? C.surface : C.surface2

            return (
              <tr key={r.id} style={{ background: rowBg }}>
                <td style={tdBase(C)}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 26,
                      height: 26,
                      padding: '0 8px',
                      borderRadius: 999,
                      background: medal ?? C.medalFallback,
                      fontSize: 11,
                      fontWeight: 800,
                      fontFamily: fontHead,
                      color: medal ? '#000' : C.text,
                    }}
                  >
                    {r.place ?? '—'}
                  </span>
                </td>

                <td style={{ ...tdBase(C), ...stickyCell(64, rowBg, 3), minWidth: nameColWidth, maxWidth: nameColWidth, width: nameColWidth }}>
                  <span
                    style={{
                      color: r.name ? C.text : C.muted,
                      fontStyle: r.name ? 'normal' : 'italic',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'block',
                      fontWeight: 600,
                    }}
                    title={r.name ?? `Bib ${r.bib_number}`}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                      {r.name ?? `Bib ${r.bib_number}`}
                      <AdjustmentMarker adjustments={r.adjustments} />
                    </span>
                  </span>
                </td>

                <td style={tdBase(C)}>
                  <span style={{ color: r.team ? C.text : C.muted }}>
                    {r.team || '—'}
                  </span>
                </td>

                <td style={tdBase(C, true)}>{r.bib_number ?? '—'}</td>

                <td style={{ ...tdBase(C, true), fontWeight: 700, color: r.is_finished ? C.green : C.muted }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span>{fmtTime(r.adjusted_time_ms ?? r.time_ms)}</span>
                    {(r.has_adjustment || r.has_checkpoint_adjustment) &&
                      r.raw_time_ms != null &&
                      r.raw_time_ms !== (r.adjusted_time_ms ?? r.time_ms) && (
                        <span style={{ color: C.orange, fontSize: 10 }}>
                          raw {fmtTime(r.raw_time_ms)}
                        </span>
                      )}
                  </div>
                </td>

                {displayCheckpoints.map(cp => {
                  const splitMs = r.checkpoint_split_times?.[cp.id]
                  const cumulativeMs = r.checkpoint_times?.[cp.id]

                  return (
                    <td key={cp.id} style={tdBase(C, true)}>
                      {cumulativeMs != null ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ color: cp.isFinish ? C.green : C.text, fontWeight: 700 }}>
                            {fmtTime(splitMs)}
                          </span>
                          <span style={{ color: C.muted, fontSize: 10 }}>
                            ({fmtTime(cumulativeMs)})
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: C.dim }}>—</span>
                      )}
                    </td>
                  )
                })}

                <td style={tdBase(C)}>
                  <span style={{ color: r.wave_code ? C.text : C.muted }}>
                    {r.wave_code || '—'}
                  </span>
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

  const [event, setEvent] = useState(null)
  const [entries, setEntries] = useState([])
  const [checkpoints, setCheckpoints] = useState([])
  const [waves, setWaves] = useState([])
  const [laps, setLaps] = useState([])
  const [finishes, setFinishes] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [effectiveCheckpointRows, setEffectiveCheckpointRows] = useState([])
  const [resultsGenderFilter, setResultsGenderFilter] = useState('Overall')
  const [resultsDivisionFilter, setResultsDivisionFilter] = useState('all')
  const [checkpointSortMode, setCheckpointSortMode] = useState('cumulative')
  const [lastUpdate, setLastUpdate] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [theme, setTheme] = useState('light')
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const [showFinishersOnly, setShowFinishersOnly] = useState(false)

  const [resultsSort, setResultsSort] = useState({ key: 'place', dir: 'asc', type: 'number' })

  const C = THEMES[theme]
  const nameColWidth = isMobile ? MOBILE_NAME_COL_WIDTH : DESKTOP_NAME_COL_WIDTH

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme)
    } else {
      setTheme('light')
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!eventId) return

    async function loadAll() {
      const [
        { data: eventData },
        { data: entryData },
        { data: checkpointData },
        { data: waveData },
        { data: lapData },
        { data: finishData },
        { data: adjustmentData },
        { data: effectiveRowsData, error: effectiveRowsError },
      ] = await Promise.all([
        supabase.from('race_events').select('*').eq('id', eventId).single(),
        supabase.rpc('get_public_event_entries', { p_event_id: eventId }),
        supabase.from('race_checkpoints').select('*').eq('event_id', eventId).eq('is_active', true).order('checkpoint_order'),
        supabase.from('race_waves').select('*').eq('event_id', eventId).order('display_order', { ascending: true }),
        supabase.from('lap_events').select('*').eq('event_id', eventId),
        supabase.from('race_finishes').select('*').eq('event_id', eventId).order('place', { ascending: true }),
        supabase.from('race_result_adjustments').select('*').eq('event_id', eventId).order('created_at', { ascending: true }),
        supabase.rpc('get_event_effective_checkpoint_results', { p_event_id: eventId }),
      ])

      setEvent(eventData || null)
      setEntries(entryData || [])
      setCheckpoints(checkpointData || [])
      setWaves(waveData || [])
      setLaps(lapData || [])
      setFinishes(finishData || [])
      setAdjustments(adjustmentData || [])

      if (effectiveRowsError) {
        console.error('Failed to load effective checkpoint results', effectiveRowsError)
      }

      setEffectiveCheckpointRows(effectiveRowsData || [])
      setLastUpdate(new Date())
    }

    loadAll()

    const ch = supabase
      .channel(`live-results:${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'race_events', filter: `id=eq.${eventId}` },
        () => loadAll()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lap_events', filter: `event_id=eq.${eventId}` },
        () => loadAll()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'race_finishes', filter: `event_id=eq.${eventId}` },
        () => loadAll()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'race_waves', filter: `event_id=eq.${eventId}` },
        () => loadAll()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_entries', filter: `event_id=eq.${eventId}` },
        () => loadAll()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'race_result_adjustments', filter: `event_id=eq.${eventId}` },
        () => loadAll()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checkpoint_time_adjustments', filter: `event_id=eq.${eventId}` },
        () => loadAll()
      )
      .subscribe((status) => {
        console.log('LiveResults realtime status:', status)
      })

    const fallbackPoll = setInterval(loadAll, 5000)

    return () => {
      clearInterval(fallbackPoll)
      supabase.removeChannel(ch)
    }
  }, [eventId])

  const raceElapsedMs = getRaceElapsedMs(event, now)
  const isLive = event?.status === 'active'

  const wavesById = useMemo(() => {
    return Object.fromEntries(waves.map(w => [w.id, w]))
  }, [waves])

  const entriesByBib = useMemo(() => {
    const map = {}
    entries.forEach(e => {
      if (!map[e.bib_number]) map[e.bib_number] = []
      map[e.bib_number].push(e)
    })
    return map
  }, [entries])

  const checkpointsSorted = useMemo(() => {
    return [...checkpoints].sort((a, b) => a.checkpoint_order - b.checkpoint_order)
  }, [checkpoints])

  const finishCheckpoint = useMemo(() => {
    if (!checkpointsSorted.length) return null
    return checkpointsSorted[checkpointsSorted.length - 1]
  }, [checkpointsSorted])

  const displayCheckpoints = useMemo(() => {
    return checkpointsSorted.map(cp => ({
      ...cp,
      isFinish: finishCheckpoint?.id === cp.id,
    }))
  }, [checkpointsSorted, finishCheckpoint])

  const finishCheckpointId = finishCheckpoint?.id || null

  const finishLapEvents = useMemo(() => {
    if (!finishCheckpointId) return []

    return laps.filter(l =>
      l.status !== 'void' &&
      l.checkpoint_id === finishCheckpointId
    )
  }, [laps, finishCheckpointId])

  const pendingFinishLapEvents = useMemo(() => {
    return finishLapEvents.filter(l => !l.bib_number)
  }, [finishLapEvents])

  const pendingFinishCount = pendingFinishLapEvents.length
  const resultsAreProvisional = pendingFinishCount > 0 || event?.status !== 'finished'

  const finishMapFromTable = useMemo(() => {
    const map = {}
    finishes.forEach(f => {
      if (f.bib_number) map[f.bib_number] = f
    })
    return map
  }, [finishes])

  const adjustmentMap = useMemo(() => {
    return groupAdjustmentsByEntryOrBib(adjustments || [])
  }, [adjustments])

  const divisions = useMemo(() => {
    const vals = new Set()

    entries.forEach(e => {
      if (e.division) vals.add(e.division)
    })

    effectiveCheckpointRows.forEach(r => {
      if (r.division) vals.add(r.division)
    })

    finishes.forEach(f => {
      if (f.bib_number) {
        const entry = getPrimaryEntry(entriesByBib[f.bib_number])
        if (entry?.division) vals.add(entry.division)
      }
    })

    return Array.from(vals).sort((a, b) => a.localeCompare(b))
  }, [entries, effectiveCheckpointRows, finishes, entriesByBib])

  const countdownTargetMs = useMemo(() => {
    if (event?.race_started_at) return null

    if (event?.event_date) {
      const target = new Date(event.event_date)
      if (!Number.isNaN(target.getTime())) return target.getTime()
    }

    return null
  }, [event?.event_date, event?.race_started_at])

  const countdownMs = useMemo(() => {
    return countdownTargetMs ? Math.max(0, countdownTargetMs - now) : null
  }, [countdownTargetMs, now])

  const effectiveRowsByBib = useMemo(() => {
    const map = {}

    effectiveCheckpointRows.forEach(row => {
      if (!row.bib_number) return
      if (!map[row.bib_number]) map[row.bib_number] = []
      map[row.bib_number].push(row)
    })

    Object.values(map).forEach(rows => {
      rows.sort((a, b) => a.checkpoint_order - b.checkpoint_order)
    })

    return map
  }, [effectiveCheckpointRows])

  const baseResultsRows = useMemo(() => {
    const allBibs = new Set()

    entries.forEach(entry => {
      if (entry.bib_number) allBibs.add(entry.bib_number)
    })

    effectiveCheckpointRows.forEach(row => {
      if (row.bib_number) allBibs.add(row.bib_number)
    })

    finishes.forEach(f => {
      if (f.bib_number) allBibs.add(f.bib_number)
    })

    const rows = Array.from(allBibs).map(bib => {
      const entriesForBib = entriesByBib[bib] || []
      const primaryEntry = getPrimaryEntry(entriesForBib)
      const finishFromTable = finishMapFromTable[bib] || null
      const cpRows = effectiveRowsByBib[bib] || []
      const finishRow = cpRows.find(r => r.is_finish)

      const checkpoint_times = {}
      const checkpoint_split_times = {}
      let latestCheckpointOrder = 0
      let latestCheckpointElapsedMs = null

      cpRows.forEach(cpRow => {
        if (cpRow.effective_elapsed_ms == null) return

        checkpoint_times[cpRow.checkpoint_id] = cpRow.effective_elapsed_ms
        checkpoint_split_times[cpRow.checkpoint_id] = cpRow.effective_split_ms

        if (
          cpRow.checkpoint_order > latestCheckpointOrder ||
          (
            cpRow.checkpoint_order === latestCheckpointOrder &&
            (
              latestCheckpointElapsedMs == null ||
              cpRow.effective_elapsed_ms < latestCheckpointElapsedMs
            )
          )
        ) {
          latestCheckpointOrder = cpRow.checkpoint_order
          latestCheckpointElapsedMs = cpRow.effective_elapsed_ms
        }
      })

      const baseFinishMs =
        finishRow?.effective_elapsed_ms ??
        finishFromTable?.time_ms ??
        null

      const rawFinishMs =
        finishRow?.raw_elapsed_ms ??
        finishFromTable?.time_ms ??
        null

      const hasCheckpointAdjustment = cpRows.some(r => r.adjustment_id != null)

      const baseRow = {
        id: finishFromTable?.id || primaryEntry?.id || `row-${bib}`,
        entry_id: primaryEntry?.id || finishRow?.entry_id || null,
        bib_number: bib,
        name: getDisplayNameForBib(entriesForBib, bib),
        team: primaryEntry?.team || null,
        division: primaryEntry?.division || finishRow?.division || null,
        gender: primaryEntry?.gender || finishRow?.gender || null,
        normalizedGender: normalizeGender(primaryEntry?.gender || finishRow?.gender),
        wave_code: primaryEntry?.wave_id ? (wavesById[primaryEntry.wave_id]?.wave_code || null) : null,
        time_ms: baseFinishMs,
        raw_time_ms: rawFinishMs,
        checkpoint_times,
        checkpoint_split_times,
        latestCheckpointOrder,
        latestCheckpointElapsedMs,
        is_finished: baseFinishMs != null,
        has_checkpoint_adjustment: hasCheckpointAdjustment,
        adjusted_checkpoint_count: cpRows.filter(r => r.adjustment_id != null).length,
      }

      const adjustmentKey = getAdjustmentKey(baseRow)
      const rowAdjustments = adjustmentMap.get(adjustmentKey) || []
      const totalAdjustmentMs = sumAdjustments(rowAdjustments)

      return {
        ...baseRow,
        adjustments: rowAdjustments,
        total_adjustment_ms: totalAdjustmentMs,
        adjusted_time_ms: baseFinishMs != null ? baseFinishMs + totalAdjustmentMs : null,
        has_adjustment: rowAdjustments.length > 0,
      }
    })

    rows.sort((a, b) => {
      const aFinished = a.is_finished
      const bFinished = b.is_finished

      if (aFinished && bFinished) {
        const aSortTime = a.adjusted_time_ms ?? a.time_ms
        const bSortTime = b.adjusted_time_ms ?? b.time_ms
        if (aSortTime !== bSortTime) return aSortTime - bSortTime
        return String(a.bib_number).localeCompare(String(b.bib_number), undefined, { numeric: true })
      }

      if (aFinished) return -1
      if (bFinished) return 1

      if (a.latestCheckpointOrder !== b.latestCheckpointOrder) {
        return b.latestCheckpointOrder - a.latestCheckpointOrder
      }

      const aElapsed = a.latestCheckpointElapsedMs == null ? Infinity : a.latestCheckpointElapsedMs
      const bElapsed = b.latestCheckpointElapsedMs == null ? Infinity : b.latestCheckpointElapsedMs

      if (aElapsed !== bElapsed) return aElapsed - bElapsed

      return String(a.bib_number).localeCompare(String(b.bib_number), undefined, { numeric: true })
    })

    return rows
  }, [
    entries,
    finishes,
    entriesByBib,
    finishMapFromTable,
    wavesById,
    adjustmentMap,
    effectiveCheckpointRows,
    effectiveRowsByBib,
  ])

  const resultsGenderTabs = useMemo(() => {
    const found = new Set()

    baseResultsRows.forEach(r => {
      found.add(r.normalizedGender)
    })

    const ordered = ['Men', 'Women', 'Non-Binary', 'Other', 'Unspecified']
      .filter(x => found.has(x))

    return ['Overall', ...ordered]
  }, [baseResultsRows])

  useEffect(() => {
    if (!resultsGenderTabs.includes(resultsGenderFilter)) {
      setResultsGenderFilter('Overall')
    }
  }, [resultsGenderTabs, resultsGenderFilter])

  const filteredResultsRows = useMemo(() => {
    let rows = baseResultsRows

    if (resultsGenderFilter !== 'Overall') {
      rows = rows.filter(r => r.normalizedGender === resultsGenderFilter)
    }

    if (resultsDivisionFilter === 'unknown') {
      rows = rows.filter(r => !r.division)
    } else if (resultsDivisionFilter !== 'all') {
      rows = rows.filter(r => r.division === resultsDivisionFilter)
    }

    if (showFinishersOnly) {
      rows = rows.filter(r => r.is_finished)
    }

    const sorted = [...rows].sort((a, b) => {
      if (resultsSort.key.startsWith('cp:')) {
        const checkpointId = resultsSort.key.split(':')[1]
        const aVal = checkpointSortMode === 'split'
          ? a.checkpoint_split_times?.[checkpointId]
          : a.checkpoint_times?.[checkpointId]
        const bVal = checkpointSortMode === 'split'
          ? b.checkpoint_split_times?.[checkpointId]
          : b.checkpoint_times?.[checkpointId]
        const cmp = compareValues(aVal, bVal, resultsSort.dir, 'number')
        if (cmp !== 0) return cmp
      } else if (resultsSort.key === 'place') {
        const aVal = a.is_finished ? (a.adjusted_time_ms ?? a.time_ms) : null
        const bVal = b.is_finished ? (b.adjusted_time_ms ?? b.time_ms) : null
        const cmp = compareValues(aVal, bVal, resultsSort.dir, 'number')
        if (cmp !== 0) return cmp
      } else {
        const cmp = compareValues(a[resultsSort.key], b[resultsSort.key], resultsSort.dir, resultsSort.type)
        if (cmp !== 0) return cmp
      }

      if (a.is_finished && b.is_finished) {
        const aSortTime = a.adjusted_time_ms ?? a.time_ms
        const bSortTime = b.adjusted_time_ms ?? b.time_ms
        if (aSortTime !== bSortTime) return aSortTime - bSortTime
      } else if (a.is_finished) {
        return -1
      } else if (b.is_finished) {
        return 1
      } else {
        if (a.latestCheckpointOrder !== b.latestCheckpointOrder) {
          return b.latestCheckpointOrder - a.latestCheckpointOrder
        }

        const aElapsed = a.latestCheckpointElapsedMs == null ? Infinity : a.latestCheckpointElapsedMs
        const bElapsed = b.latestCheckpointElapsedMs == null ? Infinity : b.latestCheckpointElapsedMs

        if (aElapsed !== bElapsed) return aElapsed - bElapsed
      }

      return compareValues(a.bib_number, b.bib_number, 'asc', 'number')
    })

    let finishPlace = 0

    return sorted.map(r => {
      const isPlaced = r.is_finished
      if (isPlaced) finishPlace += 1

      return {
        ...r,
        place: isPlaced ? finishPlace : null,
      }
    })
  }, [
    baseResultsRows,
    resultsGenderFilter,
    resultsDivisionFilter,
    resultsSort,
    checkpointSortMode,
    showFinishersOnly,
  ])

  const teamStandings = useMemo(() => {
    const finished = filteredResultsRows.filter(r => r.is_finished && r.team)

    const grouped = new Map()

    finished.forEach(r => {
      if (!grouped.has(r.team)) grouped.set(r.team, [])
      grouped.get(r.team).push(r)
    })

    const complete = []
    const incomplete = []

    for (const [team, runners] of grouped.entries()) {
      const sorted = [...runners].sort((a, b) => {
        const aPlace = a.place ?? Infinity
        const bPlace = b.place ?? Infinity
        if (aPlace !== bPlace) return aPlace - bPlace
        return compareValues(a.bib_number, b.bib_number, 'asc', 'number')
      })

      const scorers = sorted.slice(0, 4)

      const row = {
        team,
        finishers: sorted.length,
        scorers,
        score: scorers.length === 4 ? scorers.reduce((sum, r) => sum + (r.place ?? 0), 0) : null,
      }

      if (sorted.length >= 4) complete.push(row)
      else incomplete.push(row)
    }

    complete.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score

      const a4 = a.scorers[3]?.place ?? Infinity
      const b4 = b.scorers[3]?.place ?? Infinity
      if (a4 !== b4) return a4 - b4

      return a.team.localeCompare(b.team)
    })

    incomplete.sort((a, b) => {
      if (a.finishers !== b.finishers) return b.finishers - a.finishers
      return a.team.localeCompare(b.team)
    })

    return { complete, incomplete }
  }, [filteredResultsRows])

  const hasUnknownResultsDivisionRows = useMemo(() => {
    return baseResultsRows.some(r => !r.division)
  }, [baseResultsRows])

  const subTabBtn = active => ({
    padding: isMobile ? '7px 12px' : '8px 14px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontFamily: fontHead,
    fontSize: isMobile ? 9 : 10,
    fontWeight: 700,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: active ? C.blue : C.muted,
    borderBottom: active ? `2px solid ${C.blue}` : '2px solid transparent',
  })

  const handleResultsSort = (key, type = 'string') => {
    setResultsSort(prev => ({
      key,
      type,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
    }))
  }

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, color: C.text, fontFamily: fontBody }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />

      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: isMobile ? '12px 14px' : '14px 20px' }}>
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr auto',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 9, color: C.orange, letterSpacing: 3, fontFamily: fontHead, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
              AthleteOS · Live Results
            </div>

            <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 900, fontFamily: fontHead, letterSpacing: 0.5, marginBottom: 4 }}>
              {event?.name ?? '…'}
            </div>

            <div style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: 8 }}>
            <ThemeToggle theme={theme} setTheme={setTheme} C={C} />

            <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
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
                {event?.status === 'finished'
                  ? 'Final Time'
                  : event?.race_started_at
                    ? 'Race Clock'
                    : 'Event Status'}
              </div>

              <div
                style={{
                  fontSize: isMobile ? 'clamp(24px, 6vw, 34px)' : 'clamp(28px, 4vw, 42px)',
                  fontWeight: 900,
                  fontFamily: fontHead,
                  letterSpacing: -1.5,
                  lineHeight: 1,
                  color: event?.race_started_at ? C.text : C.muted,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {event?.status === 'finished'
                  ? 'Finished'
                  : event?.race_started_at
                    ? formatRaceClock(raceElapsedMs)
                    : 'Awaiting Start'}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: 4, marginTop: 6 }}>
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
      </div>

      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: isMobile ? '10px 14px' : '12px 20px',
          }}
        >
          <div
            style={{
              border: `1px solid ${pendingFinishCount > 0 ? C.yellow : resultsAreProvisional ? C.orange : C.green}`,
              background:
                pendingFinishCount > 0
                  ? `${C.yellow}14`
                  : resultsAreProvisional
                    ? `${C.orange}14`
                    : `${C.green}14`,
              color: pendingFinishCount > 0 ? C.yellow : resultsAreProvisional ? C.orange : C.green,
              borderRadius: 10,
              padding: isMobile ? '10px 12px' : '12px 14px',
              fontFamily: fontHead,
              fontSize: isMobile ? 10 : 11,
              fontWeight: 800,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
            }}
          >
            {pendingFinishCount > 0
              ? `Unofficial — ${pendingFinishCount} finish ${pendingFinishCount === 1 ? 'record is' : 'records are'} pending bib assignment`
              : event?.status === 'finished'
                ? 'Unofficial Results — all recorded finishers currently assigned'
                : 'Live Results — standings may change as racers finish'}
          </div>
        </div>
      </div>

      {!event?.race_started_at && (
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
          <div
            className="hero-grid"
            style={{
              maxWidth: 1200,
              margin: '0 auto',
              padding: isMobile ? '14px' : '18px 20px',
              display: 'grid',
              gridTemplateColumns: '1.2fr 0.8fr',
              gap: 16,
              alignItems: 'stretch',
            }}
          >
            <div
              style={{
                border: `1px solid ${C.border}`,
                background: C.surface2,
                borderRadius: 14,
                padding: isMobile ? '16px 14px' : '20px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: C.orange,
                  letterSpacing: 2,
                  fontFamily: fontHead,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Live Results
              </div>

              <div
                style={{
                  fontSize: isMobile ? 'clamp(24px, 8vw, 34px)' : 'clamp(30px, 5vw, 46px)',
                  lineHeight: 1,
                  fontWeight: 900,
                  fontFamily: fontHead,
                  color: C.text,
                }}
              >
                {event?.name || 'Race Event'}
              </div>

              <div
                style={{
                  marginTop: 10,
                  fontSize: 13,
                  color: C.muted,
                  lineHeight: 1.5,
                }}
              >
                Standings, splits, and finish results will appear here when the race begins.
              </div>
            </div>

            <div
              style={{
                border: `1px solid ${C.border}`,
                background: C.surface2,
                borderRadius: 14,
                padding: isMobile ? '16px 14px' : '20px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: C.orange,
                  letterSpacing: 2,
                  fontFamily: fontHead,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Countdown to Start
              </div>

              <div
                style={{
                  fontSize: isMobile ? 'clamp(30px, 9vw, 46px)' : 'clamp(40px, 6vw, 64px)',
                  fontWeight: 900,
                  fontFamily: fontHead,
                  color: C.blue,
                  lineHeight: 1,
                  letterSpacing: -1.5,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {countdownMs != null ? formatCountdown(countdownMs) : 'TBD'}
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: C.muted }}>
                {countdownMs != null
                  ? 'Live results begin when the race starts.'
                  : 'Start time has not been announced yet.'}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { label: 'Finishers', value: baseResultsRows.filter(r => r.is_finished).length, color: C.blue },
            { label: 'Pending Finish IDs', value: pendingFinishCount, color: pendingFinishCount > 0 ? C.yellow : C.green },
            { label: 'Teams Scoring', value: teamStandings.complete.length, color: C.orange },
            { label: 'Divisions', value: divisions.length, color: C.text },
          ].map((s, idx, arr) => (
            <div
              key={s.label}
              style={{
                padding: isMobile ? '8px 8px' : '10px 12px',
                borderRight: idx < arr.length - 1 ? `1px solid ${C.border}` : 'none',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, fontFamily: fontHead, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 8, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.3, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {pendingFinishCount > 0 && (
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '10px 14px' : '12px 20px' }}>
            <div
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: isMobile ? '10px 12px' : '12px 14px',
              }}
            >
              <div
                style={{
                  fontFamily: fontHead,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  color: C.muted,
                  marginBottom: 8,
                }}
              >
                Pending Finish Records
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {pendingFinishLapEvents.slice(0, 12).map(l => (
                  <div
                    key={l.id}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 999,
                      border: `1px solid ${C.border}`,
                      background: C.surface2,
                      color: C.text,
                      fontSize: 12,
                      fontFamily: fontMono,
                    }}
                  >
                    {fmtTime(l.elapsed_ms)}
                  </div>
                ))}

                {pendingFinishCount > 12 && (
                  <div
                    style={{
                      padding: '6px 10px',
                      borderRadius: 999,
                      border: `1px solid ${C.border}`,
                      background: C.surface2,
                      color: C.muted,
                      fontSize: 12,
                    }}
                  >
                    +{pendingFinishCount - 12} more
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: C.surface, borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', minWidth: 'max-content' }}>
          {resultsGenderTabs.map(g => (
            <button
              key={g}
              style={subTabBtn(resultsGenderFilter === g)}
              onClick={() => setResultsGenderFilter(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div style={{ position: 'sticky', top: 40, zIndex: 19, background: C.surface, borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', minWidth: 'max-content' }}>
          <button style={subTabBtn(resultsDivisionFilter === 'all')} onClick={() => setResultsDivisionFilter('all')}>
            All Divisions
          </button>

          {divisions.map(div => (
            <button
              key={div}
              style={subTabBtn(resultsDivisionFilter === div)}
              onClick={() => setResultsDivisionFilter(div)}
            >
              {div}
            </button>
          ))}

          {hasUnknownResultsDivisionRows && (
            <button
              style={subTabBtn(resultsDivisionFilter === 'unknown')}
              onClick={() => setResultsDivisionFilter('unknown')}
            >
              Unknown
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '12px 14px' : '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              border: `1px solid ${C.border}`,
              borderRadius: 999,
              overflow: 'hidden',
              background: C.surface,
            }}
          >
            <button
              onClick={() => setShowFinishersOnly(false)}
              style={{
                padding: isMobile ? '6px 8px' : '6px 10px',
                border: 'none',
                background: !showFinishersOnly ? C.surface2 : 'transparent',
                color: !showFinishersOnly ? C.text : C.muted,
                cursor: 'pointer',
                fontFamily: fontHead,
                fontSize: isMobile ? 9 : 10,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              All Racers
            </button>
            <button
              onClick={() => setShowFinishersOnly(true)}
              style={{
                padding: isMobile ? '6px 8px' : '6px 10px',
                border: 'none',
                background: showFinishersOnly ? C.surface2 : 'transparent',
                color: showFinishersOnly ? C.text : C.muted,
                cursor: 'pointer',
                fontFamily: fontHead,
                fontSize: isMobile ? 9 : 10,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              Finishers Only
            </button>
          </div>

          <div
            style={{
              display: 'inline-flex',
              border: `1px solid ${C.border}`,
              borderRadius: 999,
              overflow: 'hidden',
              background: C.surface,
            }}
          >
            <button
              onClick={() => setCheckpointSortMode('cumulative')}
              style={{
                padding: isMobile ? '6px 8px' : '6px 10px',
                border: 'none',
                background: checkpointSortMode === 'cumulative' ? C.surface2 : 'transparent',
                color: checkpointSortMode === 'cumulative' ? C.text : C.muted,
                cursor: 'pointer',
                fontFamily: fontHead,
                fontSize: isMobile ? 9 : 10,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              CP Sort: Cumulative
            </button>
            <button
              onClick={() => setCheckpointSortMode('split')}
              style={{
                padding: isMobile ? '6px 8px' : '6px 10px',
                border: 'none',
                background: checkpointSortMode === 'split' ? C.surface2 : 'transparent',
                color: checkpointSortMode === 'split' ? C.text : C.muted,
                cursor: 'pointer',
                fontFamily: fontHead,
                fontSize: isMobile ? 9 : 10,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              CP Sort: Split
            </button>
          </div>
        </div>

        <TeamStandingsCard
          standings={teamStandings}
          C={C}
          isMobile={isMobile}
        />

        <ResultsTable
          rows={filteredResultsRows}
          displayCheckpoints={displayCheckpoints}
          sortConfig={resultsSort}
          onSort={handleResultsSort}
          C={C}
          isMobile={isMobile}
          nameColWidth={nameColWidth}
        />
      </div>

      <div style={{ textAlign: 'center', color: C.footer, fontSize: 11, padding: '24px 0', letterSpacing: 1, fontFamily: fontHead }}>
        POWERED BY ATHLETEOS
      </div>

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1 }
          50% { opacity: 0.3 }
        }

        @media (max-width: 900px) {
          .hero-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}