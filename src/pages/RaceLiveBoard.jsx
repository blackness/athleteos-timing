import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getRaceElapsedMs } from '../lib/raceClock'
import { useTheme } from '../contexts/ThemeContext'

const F = "'Barlow Condensed', sans-serif"
const FB = "'Barlow', sans-serif"

const THEMES = {
  dark: {
    bg: `
      radial-gradient(circle at 12% 8%, rgba(249,115,22,0.22), transparent 24%),
      radial-gradient(circle at 88% 12%, rgba(59,130,246,0.18), transparent 22%),
      linear-gradient(180deg, #0b0f16 0%, #05070c 100%)
    `,
    cardBg: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.025))',
    cardBgStrong: 'linear-gradient(180deg, rgba(249,115,22,0.20), rgba(255,255,255,0.04))',
    cardBgHighlight: 'linear-gradient(180deg, rgba(249,115,22,0.20), rgba(255,255,255,0.05))',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(249,115,22,0.34)',
    text: '#f8fafc',
    textSoft: '#cbd5e1',
    textMuted: '#94a3b8',
    textDim: '#475569',
    orange: '#fb923c',
    blue: '#60a5fa',
    buttonBg: 'rgba(255,255,255,0.05)',
    buttonActiveBg: 'rgba(59,130,246,0.18)',
    shadow: '0 24px 70px rgba(0,0,0,0.35)',
    rowAlt: 'rgba(255,255,255,0.025)',
    rowFlash: 'linear-gradient(90deg, rgba(249,115,22,0.24), rgba(249,115,22,0.05))',
  },
  light: {
    bg: `
      radial-gradient(circle at 12% 8%, rgba(249,115,22,0.10), transparent 24%),
      radial-gradient(circle at 88% 12%, rgba(59,130,246,0.08), transparent 22%),
      linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)
    `,
    cardBg: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.88))',
    cardBgStrong: 'linear-gradient(180deg, rgba(249,115,22,0.12), rgba(255,255,255,0.92))',
    cardBgHighlight: 'linear-gradient(180deg, rgba(249,115,22,0.10), rgba(255,255,255,0.94))',
    border: 'rgba(148,163,184,0.28)',
    borderStrong: 'rgba(249,115,22,0.34)',
    text: '#0f172a',
    textSoft: '#334155',
    textMuted: '#64748b',
    textDim: '#94a3b8',
    orange: '#ea580c',
    blue: '#2563eb',
    buttonBg: 'rgba(255,255,255,0.75)',
    buttonActiveBg: 'rgba(37,99,235,0.12)',
    shadow: '0 18px 50px rgba(15,23,42,0.10)',
    rowAlt: 'rgba(148,163,184,0.06)',
    rowFlash: 'linear-gradient(90deg, rgba(249,115,22,0.18), rgba(249,115,22,0.04))',
  },
}

function fmt(ms, includeCenti = true) {
  if (ms == null) return '00:00'
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

function ThemeToggle({ mode, setMode, C }) {
  const btn = active => ({
    padding: '8px 12px',
    borderRadius: 999,
    border: `1px solid ${C.border}`,
    background: active ? C.buttonActiveBg : C.buttonBg,
    color: active ? C.text : C.textMuted,
    cursor: 'pointer',
    fontFamily: F,
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  })

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button style={btn(mode === 'light')} onClick={() => setMode('light')}>
        ☀ Light
      </button>
      <button style={btn(mode === 'dark')} onClick={() => setMode('dark')}>
        🌙 Dark
      </button>
    </div>
  )
}

export default function RaceLiveBoard() {
  const { id: eventId } = useParams()
  const { mode, setMode } = useTheme()
  const C = THEMES[mode]

  const [event, setEvent] = useState(null)
  const [entries, setEntries] = useState({})
  const [checkpoints, setCheckpoints] = useState({})
  const [laps, setLaps] = useState([])
  const [elapsed, setElapsed] = useState(0)
  const [flashId, setFlashId] = useState(null)
  const [hidePending, setHidePending] = useState(true)

  const tickRef = useRef(null)
  const flashTimeoutRef = useRef(null)

  useEffect(() => {
    async function load() {
      const [
        { data: eventData, error: eventError },
        { data: entryData, error: entryError },
        { data: checkpointData, error: checkpointError },
        { data: lapData, error: lapError },
      ] = await Promise.all([
        supabase.from('race_events').select('*').eq('id', eventId).single(),
        supabase.rpc('get_public_event_entries', { p_event_id: eventId }),
        supabase.from('race_checkpoints').select('*').eq('event_id', eventId).order('checkpoint_order', { ascending: true }),
        supabase
          .from('lap_events')
          .select('*')
          .eq('event_id', eventId)
          .order('captured_at', { ascending: false })
          .limit(100),
      ])

      if (eventError) console.error('RaceLiveBoard event load error:', eventError)
      if (entryError) console.error('RaceLiveBoard entry load error:', entryError)
      if (checkpointError) console.error('RaceLiveBoard checkpoint load error:', checkpointError)
      if (lapError) console.error('RaceLiveBoard lap load error:', lapError)

      setEvent(eventData || null)

      const entryMap = {}
      ;(entryData || []).forEach(e => {
        entryMap[e.id] = e
        if (e.bib_number) entryMap[`bib:${e.bib_number}`] = e
      })
      setEntries(entryMap)

      const checkpointMap = {}
      ;(checkpointData || []).forEach(cp => {
        checkpointMap[cp.id] = cp
      })
      setCheckpoints(checkpointMap)

      setLaps((lapData || []).filter(l => l.status !== 'void'))
    }

    load()

    const ch = supabase
      .channel(`race-live-board:${eventId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'race_events', filter: `id=eq.${eventId}` },
        payload => {
          setEvent(payload.new)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lap_events', filter: `event_id=eq.${eventId}` },
        payload => {
          const row = payload.new
          if (!row) return

          setLaps(prev => {
            let next
            const exists = prev.find(x => x.id === row.id)

            if (payload.eventType === 'INSERT') {
              next = exists ? prev : [row, ...prev]
            } else {
              next = exists ? prev.map(x => (x.id === row.id ? row : x)) : [row, ...prev]
            }

            next = next.filter(x => x.status !== 'void')
            next.sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))
            return next.slice(0, 100)
          })

          if (payload.eventType === 'INSERT' && row.status !== 'void') {
            setFlashId(row.id)
            clearTimeout(flashTimeoutRef.current)
            flashTimeoutRef.current = setTimeout(() => setFlashId(null), 5000)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
      clearInterval(tickRef.current)
      clearTimeout(flashTimeoutRef.current)
    }
  }, [eventId])

  useEffect(() => {
    clearInterval(tickRef.current)

    if (!event?.race_started_at) {
      setElapsed(0)
      return
    }

    const updateElapsed = () => {
      setElapsed(getRaceElapsedMs(event, Date.now()) ?? 0)
    }

    updateElapsed()

    if (event?.status === 'active') {
      tickRef.current = setInterval(updateElapsed, 50)
    }

    return () => clearInterval(tickRef.current)
  }, [event])

  const enrichedLaps = useMemo(() => {
    return laps.map(l => {
      const entry = l.entry_id ? entries[l.entry_id] : entries[`bib:${l.bib_number}`]
      const checkpoint = checkpoints[l.checkpoint_id]

      const displayName =
        entry
          ? `${entry.first_name ?? ''}${entry.last_name ? ` ${entry.last_name}` : ''}`.trim() || entry.team || `Bib ${l.bib_number ?? '—'}`
          : l.bib_number
            ? `Bib ${l.bib_number}`
            : 'Bib pending'

      return {
        ...l,
        entry,
        checkpoint,
        displayName,
        team: entry?.team || '',
        checkpointLabel: checkpoint?.name || `Checkpoint ${checkpoint?.checkpoint_order ?? ''}`,
        isPendingIdentity: l.status === 'pending',
      }
    })
  }, [laps, entries, checkpoints])

  const pendingCount = useMemo(() => {
    return enrichedLaps.filter(l => l.isPendingIdentity).length
  }, [enrichedLaps])

  const visibleLaps = useMemo(() => {
    return hidePending ? enrichedLaps.filter(l => !l.isPendingIdentity) : enrichedLaps
  }, [enrichedLaps, hidePending])

  const latest = visibleLaps[0] || null
  const recent = visibleLaps.slice(0, 14)
  const podiumLatest = visibleLaps.slice(0, 3)

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        color: C.text,
        fontFamily: FB,
        padding: '28px 30px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.15fr 0.85fr',
          gap: 22,
          alignItems: 'stretch',
          marginBottom: 22,
        }}
      >
        <div
          style={{
            padding: '22px 24px',
            borderRadius: 28,
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            boxShadow: C.shadow,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: 160,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: F,
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: 4,
                textTransform: 'uppercase',
                color: C.orange,
              }}
            >
              Live Splits
            </div>

            <div
              style={{
                marginTop: 10,
                fontFamily: F,
                fontSize: 'clamp(42px, 4.4vw, 64px)',
                fontWeight: 900,
                letterSpacing: -1.4,
                lineHeight: 0.95,
                textTransform: 'uppercase',
              }}
            >
              {event?.name || 'Race Event'}
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: 18, color: C.textMuted }}>
              {event?.status === 'finished'
                ? 'Unofficial final live board'
                : event?.status === 'active'
                  ? 'Race in progress'
                  : 'Awaiting official start'}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <ThemeToggle mode={mode} setMode={setMode} C={C} />

              <button
                onClick={() => setHidePending(v => !v)}
                style={{
                  border: `1px solid ${C.border}`,
                  background: hidePending ? C.buttonActiveBg : C.buttonBg,
                  color: C.text,
                  borderRadius: 999,
                  padding: '10px 16px',
                  fontFamily: F,
                  fontSize: 16,
                  fontWeight: 800,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {hidePending ? 'Showing Named Only' : 'Showing All Crossings'}
              </button>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '20px 24px',
            borderRadius: 28,
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            boxShadow: C.shadow,
            minHeight: 160,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'flex-end',
            textAlign: 'right',
          }}
        >
          <div
            style={{
              fontFamily: F,
              fontSize: 20,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: C.textMuted,
            }}
          >
            Race Clock
          </div>

          <div
            style={{
              marginTop: 6,
              fontFamily: F,
              fontSize: 'clamp(72px, 8vw, 124px)',
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: -2.6,
              fontVariantNumeric: 'tabular-nums',
              color: event?.race_started_at ? C.text : C.textDim,
              textShadow: mode === 'dark' ? '0 12px 36px rgba(0,0,0,0.35)' : 'none',
            }}
          >
            {fmt(elapsed)}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.08fr 0.92fr',
          gap: 22,
          minHeight: 'calc(100vh - 238px)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateRows: 'auto 1fr',
            gap: 22,
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 14,
            }}
          >
            {podiumLatest.map((lap, idx) => (
              <div
                key={lap.id}
                style={{
                  borderRadius: 22,
                  padding: '18px 18px 16px',
                  background: idx === 0 ? C.cardBgHighlight : C.cardBg,
                  border: `1px solid ${idx === 0 ? C.borderStrong : C.border}`,
                  boxShadow: C.shadow,
                  minHeight: 132,
                }}
              >
                <div
                  style={{
                    fontFamily: F,
                    fontSize: 15,
                    fontWeight: 800,
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    color: idx === 0 ? C.orange : C.textMuted,
                  }}
                >
                  {idx === 0 ? 'Latest' : idx === 1 ? 'Previous' : 'Earlier'}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    fontFamily: F,
                    fontSize: 26,
                    fontWeight: 900,
                    lineHeight: 0.95,
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {lap.displayName}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    fontSize: 15,
                    color: C.textSoft,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {lap.checkpointLabel}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontFamily: F,
                      fontSize: 17,
                      fontWeight: 800,
                      color: lap.bib_number ? C.blue : C.textMuted,
                      textTransform: 'uppercase',
                    }}
                  >
                    {lap.bib_number ? `#${lap.bib_number}` : 'Pending'}
                  </div>

                  <div
                    style={{
                      fontFamily: F,
                      fontSize: 28,
                      fontWeight: 900,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmt(lap.elapsed_ms, true)}
                  </div>
                </div>
              </div>
            ))}

            {podiumLatest.length === 0 && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  borderRadius: 22,
                  padding: '24px',
                  background: C.cardBg,
                  border: `1px solid ${C.border}`,
                  color: C.textMuted,
                  fontSize: 24,
                }}
              >
                Waiting for checkpoint crossings…
              </div>
            )}
          </div>

          <div
            style={{
              borderRadius: 30,
              background: latest ? C.cardBgStrong : C.cardBg,
              border: `1px solid ${latest ? C.borderStrong : C.border}`,
              boxShadow: C.shadow,
              padding: '30px 32px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: 0,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: F,
                  fontSize: 24,
                  fontWeight: 800,
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                  color: C.orange,
                }}
              >
                Latest Crossing
              </div>

              {latest ? (
                <>
                  <div
                    style={{
                      marginTop: 18,
                      fontFamily: F,
                      fontSize: 'clamp(56px, 5.5vw, 96px)',
                      fontWeight: 900,
                      lineHeight: 0.93,
                      letterSpacing: -1.8,
                      textTransform: 'uppercase',
                    }}
                  >
                    {latest.displayName}
                  </div>

                  <div
                    style={{
                      marginTop: 16,
                      display: 'flex',
                      gap: 12,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: 999,
                        background: mode === 'dark' ? 'rgba(59,130,246,0.18)' : 'rgba(37,99,235,0.12)',
                        border: `1px solid ${C.blue}`,
                        fontFamily: F,
                        fontSize: 22,
                        fontWeight: 800,
                        letterSpacing: 1.4,
                        textTransform: 'uppercase',
                      }}
                    >
                      {latest.bib_number ? `Bib ${latest.bib_number}` : 'Bib Pending'}
                    </div>

                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: 999,
                        background: mode === 'dark' ? 'rgba(249,115,22,0.18)' : 'rgba(234,88,12,0.12)',
                        border: `1px solid ${C.orange}`,
                        fontFamily: F,
                        fontSize: 22,
                        fontWeight: 800,
                        letterSpacing: 1.4,
                        textTransform: 'uppercase',
                      }}
                    >
                      {latest.checkpointLabel}
                    </div>
                  </div>

                  {latest.team && (
                    <div
                      style={{
                        marginTop: 18,
                        fontSize: 28,
                        color: C.textSoft,
                        fontWeight: 600,
                      }}
                    >
                      {latest.team}
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: 28,
                      fontFamily: F,
                      fontSize: 'clamp(74px, 7.8vw, 132px)',
                      fontWeight: 900,
                      lineHeight: 1,
                      letterSpacing: -2.6,
                      fontVariantNumeric: 'tabular-nums',
                      color: C.text,
                      textShadow: mode === 'dark' ? '0 14px 40px rgba(0,0,0,0.32)' : 'none',
                    }}
                  >
                    {fmt(latest.elapsed_ms, true)}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    marginTop: 32,
                    color: C.textMuted,
                    fontSize: 26,
                  }}
                >
                  No visible crossings yet
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: 20,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
                fontSize: 18,
                color: C.textMuted,
              }}
            >
              <div>Total visible crossings: {visibleLaps.length}</div>
              <div>
                {hidePending
                  ? `Pending identities hidden (${pendingCount})`
                  : `Pending identities visible (${pendingCount})`}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            borderRadius: 30,
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            boxShadow: C.shadow,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div
            style={{
              padding: '20px 22px 16px',
              borderBottom: `1px solid ${C.border}`,
              display: 'grid',
              gridTemplateColumns: '132px 1fr 120px',
              gap: 16,
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <div style={{ fontFamily: F, fontSize: 18, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: C.textMuted }}>
              Split
            </div>
            <div style={{ fontFamily: F, fontSize: 18, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: C.textMuted }}>
              Athlete / Checkpoint
            </div>
            <div style={{ fontFamily: F, fontSize: 18, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: C.textMuted, textAlign: 'right' }}>
              Bib
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'hidden', padding: '6px 0' }}>
            {recent.length === 0 ? (
              <div style={{ padding: '40px 24px', color: C.textMuted, fontSize: 22 }}>
                Waiting for live data…
              </div>
            ) : (
              recent.map((lap, idx) => (
                <div
                  key={lap.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '132px 1fr 120px',
                    gap: 16,
                    alignItems: 'center',
                    padding: '16px 22px',
                    background:
                      lap.id === flashId
                        ? C.rowFlash
                        : idx % 2 === 0
                          ? 'transparent'
                          : C.rowAlt,
                    borderBottom: `1px solid ${C.border}`,
                    transition: 'background 0.4s ease',
                  }}
                >
                  <div
                    style={{
                      fontFamily: F,
                      fontSize: 30,
                      fontWeight: 900,
                      letterSpacing: -0.5,
                      fontVariantNumeric: 'tabular-nums',
                      color: C.text,
                    }}
                  >
                    {fmt(lap.elapsed_ms, true)}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: F,
                        fontSize: 30,
                        fontWeight: 900,
                        lineHeight: 1,
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: C.text,
                      }}
                    >
                      {lap.displayName}
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        fontSize: 16,
                        color: C.textSoft,
                      }}
                    >
                      <span>{lap.checkpointLabel}</span>
                      {lap.team && <span style={{ color: C.textMuted }}>• {lap.team}</span>}
                    </div>
                  </div>

                  <div
                    style={{
                      textAlign: 'right',
                      fontFamily: F,
                      fontSize: 30,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      color: lap.bib_number ? C.blue : C.textMuted,
                    }}
                  >
                    {lap.bib_number ? `#${lap.bib_number}` : 'Pending'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}