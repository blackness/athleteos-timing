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
const SURF_TURF_TAGLINE = '5 Legs. Tons of fun.'

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

function ResultsTable({ rows, displayCheckpoints, sortConfig, onSort, C, isMobile, nameColWidth }) {
  if (!rows.length) {
    return <div style={emptyStateStyle(C)}>No racers in this segment yet…</div>
  }

  const medals = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' }
  const tableMinWidth = isMobile ? 760 : 960
  const checkpointMinWidth = isMobile ? 88 : 120
  const bibMinWidth = isMobile ? 60 : 72
  const finishMinWidth = isMobile ? 96 : 120
  const waveMinWidth = isMobile ? 72 : 90

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

                <td style={tdBase(C, true)}>{r.bib_number ?? '—'}</td>

                <td style={{ ...tdBase(C, true), fontWeight: 700, color: r.is_finished ? C.green : C.muted }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span>{fmtTime(r.adjusted_time_ms ?? r.time_ms)}</span>
                   {r.has_adjustment && r.time_ms != null && (
                    <span style={{ color: C.orange, fontSize: 10 }}>
                      raw {fmtTime(r.time_ms)}
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
  const [resultsGenderFilter, setResultsGenderFilter] = useState('Overall')
  const [resultsDivisionFilter, setResultsDivisionFilter] = useState('all')
  const [checkpointSortMode, setCheckpointSortMode] = useState('cumulative')
  const [lastUpdate, setLastUpdate] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [theme, setTheme] = useState('light')
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

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
      ] = await Promise.all([
        supabase.from('race_events').select('*').eq('id', eventId).single(),
        supabase.from('event_entries').select('*').eq('event_id', eventId).order('bib_number'),
        supabase.from('race_checkpoints').select('*').eq('event_id', eventId).eq('is_active', true).order('checkpoint_order'),
        supabase.from('race_waves').select('*').eq('event_id', eventId).order('display_order', { ascending: true }),
        supabase.from('lap_events').select('*').eq('event_id', eventId),
        supabase.from('race_finishes').select('*').eq('event_id', eventId).order('place', { ascending: true }),
        supabase.from('race_result_adjustments').select('*').eq('event_id', eventId).order('created_at', { ascending: true }),
      ])

      setEvent(eventData || null)
      setEntries(entryData || [])
      setCheckpoints(checkpointData || [])
      setWaves(waveData || [])
      setLaps(lapData || [])
      setFinishes(finishData || [])
      setAdjustments(adjustmentData || [])
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

    laps.forEach(l => {
      if (l.bib_number) {
        const entry = getPrimaryEntry(entriesByBib[l.bib_number])
        if (entry?.division) vals.add(entry.division)
      }
    })

    finishes.forEach(f => {
      if (f.bib_number) {
        const entry = getPrimaryEntry(entriesByBib[f.bib_number])
        if (entry?.division) vals.add(entry.division)
      }
    })

    return Array.from(vals).sort((a, b) => a.localeCompare(b))
  }, [entries, laps, finishes, entriesByBib])

  const splitMap = useMemo(() => {
    const map = {}

    laps.forEach(l => {
      if (!l.bib_number || l.status === 'void') return
      const key = `${l.bib_number}:${l.checkpoint_id}`
      map[key] = choosePreferredSplit(map[key], l)
    })

    return map
  }, [laps])

  const getEffectiveStartMsForBib = (bib) => {
    const entriesForBib = entriesByBib[bib] || []
    const primaryEntry = getPrimaryEntry(entriesForBib)
    const wave = primaryEntry?.wave_id ? wavesById[primaryEntry.wave_id] : null

    const effectiveStart =
      wave?.actual_start_time ||
      wave?.planned_start_time ||
      event?.race_started_at ||
      null

    if (!effectiveStart) return null
    const ms = new Date(effectiveStart).getTime()
    return Number.isNaN(ms) ? null : ms
  }

  const countdownTargetMs = useMemo(() => {
    const target = new Date('2026-06-18T09:30:00')
    return target.getTime()
  }, [])

  const countdownMs = useMemo(() => {
    return countdownTargetMs ? Math.max(0, countdownTargetMs - now) : null
  }, [countdownTargetMs, now])

  const baseResultsRows = useMemo(() => {
    const allBibs = new Set()

    entries.forEach(entry => {
      if (entry.bib_number) allBibs.add(entry.bib_number)
    })

    laps.forEach(l => {
      if (l.bib_number) allBibs.add(l.bib_number)
    })

    finishes.forEach(f => {
      if (f.bib_number) allBibs.add(f.bib_number)
    })

    const rows = Array.from(allBibs).map(bib => {
      const entriesForBib = entriesByBib[bib] || []
      const primaryEntry = getPrimaryEntry(entriesForBib)
      const finishFromTable = finishMapFromTable[bib] || null
      const finishSplit = finishCheckpoint ? splitMap[`${bib}:${finishCheckpoint.id}`] : null

      const startMs = getEffectiveStartMsForBib(bib)
      const finishCapturedMs =
        finishSplit?.captured_at ? new Date(finishSplit.captured_at).getTime() : null

      const derivedFinishMs =
        finishCapturedMs != null && startMs != null
          ? Math.max(0, finishCapturedMs - startMs)
          : finishSplit?.elapsed_ms ?? null

      const time_ms = finishFromTable?.time_ms ?? derivedFinishMs ?? null

      const checkpoint_times = {}
      const checkpoint_split_times = {}
      let latestCheckpointOrder = 0
      let latestCheckpointElapsedMs = null
      let previousCumulative = null

      displayCheckpoints.forEach(cp => {
        const split = splitMap[`${bib}:${cp.id}`]
        if (!split) return

        const capturedMs = split.captured_at ? new Date(split.captured_at).getTime() : null
        const effectiveElapsed =
          capturedMs != null && startMs != null
            ? Math.max(0, capturedMs - startMs)
            : split.elapsed_ms

        checkpoint_times[cp.id] = effectiveElapsed
        checkpoint_split_times[cp.id] =
          previousCumulative == null ? effectiveElapsed : effectiveElapsed - previousCumulative

        previousCumulative = effectiveElapsed

        if (
          cp.checkpoint_order > latestCheckpointOrder ||
          (
            cp.checkpoint_order === latestCheckpointOrder &&
            (latestCheckpointElapsedMs == null || effectiveElapsed < latestCheckpointElapsedMs)
          )
        ) {
          latestCheckpointOrder = cp.checkpoint_order
          latestCheckpointElapsedMs = effectiveElapsed
        }
      })

      const baseRow = {
        id: finishFromTable?.id || primaryEntry?.id || `row-${bib}`,
        entry_id: primaryEntry?.id || null,
        bib_number: bib,
        name: getDisplayNameForBib(entriesForBib, bib),
        division: primaryEntry?.division || null,
        gender: primaryEntry?.gender || null,
        normalizedGender: normalizeGender(primaryEntry?.gender),
        wave_code: primaryEntry?.wave_id ? (wavesById[primaryEntry.wave_id]?.wave_code || null) : null,
        time_ms,
        checkpoint_times,
        checkpoint_split_times,
        latestCheckpointOrder,
        latestCheckpointElapsedMs,
        is_finished: time_ms != null,
      }

      const adjustmentKey = getAdjustmentKey(baseRow)
      const rowAdjustments = adjustmentMap.get(adjustmentKey) || []
      const totalAdjustmentMs = sumAdjustments(rowAdjustments)

      return {
        ...baseRow,
        adjustments: rowAdjustments,
        total_adjustment_ms: totalAdjustmentMs,
        adjusted_time_ms: time_ms != null ? time_ms + totalAdjustmentMs : null,
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
  }, [entries, laps, finishes, entriesByBib, finishMapFromTable, finishCheckpoint, splitMap, displayCheckpoints, wavesById, event?.race_started_at, adjustmentMap])

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

    return sorted.map((r, idx) => ({
      ...r,
      place: idx + 1,
    }))
  }, [baseResultsRows, resultsGenderFilter, resultsDivisionFilter, resultsSort, checkpointSortMode])

  const hasUnknownResultsDivisionRows = useMemo(() => {
    return baseResultsRows.some(r => !r.division)
  }, [baseResultsRows])

  const leaderRow = useMemo(() => {
    return filteredResultsRows.find(r => (r.latestCheckpointOrder || 0) > 0) || null
  }, [filteredResultsRows])

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
                Surf'n Turf
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
                {SURF_TURF_TAGLINE}
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
                Countdown to Event
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
                {formatCountdown(countdownMs)}
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: C.muted }}>
                Live results begin when the first wave starts.
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { label: 'Finishers', value: baseResultsRows.filter(r => r.is_finished).length, color: C.blue },
            { label: 'Checkpoints', value: checkpoints.length, color: C.muted },
            { label: 'Assigned splits', value: laps.filter(l => l.status !== 'void' && !!l.bib_number).length, color: C.green },
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

      {leaderRow && (
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
          <div
            style={{
              maxWidth: 1200,
              margin: '0 auto',
              padding: isMobile ? '10px 14px' : '12px 20px',
              display: 'grid',
              gridTemplateColumns: isMobile ? 'auto 1fr' : 'auto 1fr auto auto',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                minWidth: 40,
                height: 40,
                borderRadius: '50%',
                background: '#FFD700',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: fontHead,
                fontWeight: 900,
                color: '#000',
                fontSize: 17,
              }}
            >
              1
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.orange, fontFamily: fontHead, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase' }}>
                {resultsGenderFilter === 'Overall' && resultsDivisionFilter === 'all'
                  ? 'Current Leader'
                  : `${resultsGenderFilter === 'Overall' ? 'Overall' : resultsGenderFilter}${resultsDivisionFilter !== 'all' ? ` · ${resultsDivisionFilter}` : ''} Leader`}
              </div>
              <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, fontFamily: fontHead, color: C.text, lineHeight: 1 }}>
                {leaderRow.name || `Bib ${leaderRow.bib_number}`}
              </div>
              <div style={{ marginTop: 3, fontSize: 11, color: C.muted }}>
                Bib {leaderRow.bib_number} {leaderRow.wave_code ? `· Wave ${leaderRow.wave_code}` : ''}
              </div>
            </div>

            {!isMobile && (
              <>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: fontHead, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                    Current Time
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 900, fontFamily: fontHead, color: leaderRow.is_finished ? C.green : C.blue, lineHeight: 1 }}>
                    {leaderRow.is_finished ? fmtTime(leaderRow.adjusted_time_ms ?? leaderRow.time_ms) : `Leg ${leaderRow.latestCheckpointOrder || '—'}`}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: fontHead, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                    Visible Racers
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 900, fontFamily: fontHead, color: C.blue, lineHeight: 1 }}>
                    {filteredResultsRows.length}
                  </div>
                </div>
              </>
            )}
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
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