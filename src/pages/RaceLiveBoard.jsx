import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getRaceElapsedMs } from '../lib/raceClock'

const F = "'Barlow Condensed', sans-serif"
const FB = "'Barlow', sans-serif"

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

export default function RaceLiveBoard() {
  const { id: eventId } = useParams()

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
        { data: eventData },
        { data: entryData },
        { data: checkpointData },
        { data: lapData },
      ] = await Promise.all([
        supabase.from('race_events').select('*').eq('id', eventId).single(),
        supabase.from('event_entries').select('*').eq('event_id', eventId),
        supabase.from('race_checkpoints').select('*').eq('event_id', eventId).order('checkpoint_order', { ascending: true }),
        supabase
          .from('lap_events')
          .select('*')
          .eq('event_id', eventId)
          .order('captured_at', { ascending: false })
          .limit(100),
      ])

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
        isPendingIdentity: !l.bib_number,
      }
    })
  }, [laps, entries, checkpoints])

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
        background: `
          radial-gradient(circle at 12% 8%, rgba(249,115,22,0.22), transparent 24%),
          radial-gradient(circle at 88% 12%, rgba(59,130,246,0.18), transparent 22%),
          linear-gradient(180deg, #0b0f16 0%, #05070c 100%)
        `,
        color: '#f8fafc',
        fontFamily: FB,
        padding: '28px 30px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet" />

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
            background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.025))',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 24px 70px rgba(0,0,0,0.35)',
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
                color: '#fb923c',
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
            <div style={{ fontSize: 18, color: '#94a3b8' }}>
              {event?.status === 'finished'
                ? 'Unofficial final live board'
                : event?.status === 'active'
                  ? 'Race in progress'
                  : 'Awaiting official start'}
            </div>

            <button
              onClick={() => setHidePending(v => !v)}
              style={{
                border: '1px solid rgba(255,255,255,0.12)',
                background: hidePending ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.05)',
                color: '#f8fafc',
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

        <div
          style={{
            padding: '20px 24px',
            borderRadius: 28,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.025))',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 24px 70px rgba(0,0,0,0.35)',
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
              color: '#94a3b8',
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
              color: event?.race_started_at ? '#ffffff' : '#475569',
              textShadow: '0 12px 36px rgba(0,0,0,0.35)',
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
                  background:
                    idx === 0
                      ? 'linear-gradient(180deg, rgba(249,115,22,0.20), rgba(255,255,255,0.05))'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.025))',
                  border: `1px solid ${idx === 0 ? 'rgba(249,115,22,0.34)' : 'rgba(255,255,255,0.08)'}`,
                  boxShadow: '0 18px 50px rgba(0,0,0,0.28)',
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
                    color: idx === 0 ? '#fb923c' : '#94a3b8',
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
                    color: '#cbd5e1',
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
                      color: lap.bib_number ? '#60a5fa' : '#94a3b8',
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
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.025))',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#94a3b8',
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
              background: latest
                ? 'linear-gradient(180deg, rgba(249,115,22,0.20), rgba(255,255,255,0.04))'
                : 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.025))',
              border: `1px solid ${latest ? 'rgba(249,115,22,0.34)' : 'rgba(255,255,255,0.08)'}`,
              boxShadow: '0 24px 70px rgba(0,0,0,0.34)',
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
                  color: '#fb923c',
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
                        background: 'rgba(59,130,246,0.18)',
                        border: '1px solid rgba(59,130,246,0.34)',
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
                        background: 'rgba(249,115,22,0.18)',
                        border: '1px solid rgba(249,115,22,0.34)',
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
                        color: '#cbd5e1',
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
                      color: '#ffffff',
                      textShadow: '0 14px 40px rgba(0,0,0,0.32)',
                    }}
                  >
                    {fmt(latest.elapsed_ms, true)}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    marginTop: 32,
                    color: '#94a3b8',
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
                color: '#94a3b8',
              }}
            >
              <div>Total visible crossings: {visibleLaps.length}</div>
              <div>{hidePending ? 'Pending identities hidden' : 'Pending identities visible'}</div>
            </div>
          </div>
        </div>

        <div
          style={{
            borderRadius: 30,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.025))',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 24px 70px rgba(0,0,0,0.34)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div
            style={{
              padding: '20px 22px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'grid',
              gridTemplateColumns: '132px 1fr 120px',
              gap: 16,
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <div style={{ fontFamily: F, fontSize: 18, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8' }}>
              Split
            </div>
            <div style={{ fontFamily: F, fontSize: 18, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8' }}>
              Athlete / Checkpoint
            </div>
            <div style={{ fontFamily: F, fontSize: 18, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8', textAlign: 'right' }}>
              Bib
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'hidden', padding: '6px 0' }}>
            {recent.length === 0 ? (
              <div style={{ padding: '40px 24px', color: '#94a3b8', fontSize: 22 }}>
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
                        ? 'linear-gradient(90deg, rgba(249,115,22,0.24), rgba(249,115,22,0.05))'
                        : idx % 2 === 0
                          ? 'transparent'
                          : 'rgba(255,255,255,0.025)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
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
                      color: '#f8fafc',
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
                        color: '#ffffff',
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
                        color: '#cbd5e1',
                      }}
                    >
                      <span>{lap.checkpointLabel}</span>
                      {lap.team && <span style={{ color: '#94a3b8' }}>• {lap.team}</span>}
                    </div>
                  </div>

                  <div
                    style={{
                      textAlign: 'right',
                      fontFamily: F,
                      fontSize: 30,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      color: lap.bib_number ? '#60a5fa' : '#94a3b8',
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