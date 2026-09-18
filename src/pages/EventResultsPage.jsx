import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

function formatEventDisplayDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString()
}

function formatLongDate(value) {
  if (!value) return 'No date'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'No date'
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getEventStartDisplay(event) {
  if (!event) return null
  return event.start_date || event.date || null
}

function getRaceStatusMeta(status) {
  switch (status) {
    case 'active':
      return {
        label: 'Live',
        color: '#166534',
        background: '#dcfce7',
        border: '#86efac',
      }
    case 'results_review':
      return {
        label: 'Review',
        color: '#854d0e',
        background: '#fef9c3',
        border: '#fde68a',
      }
    case 'finished':
      return {
        label: 'Final',
        color: '#475569',
        background: '#f1f5f9',
        border: '#cbd5e1',
      }
    default:
      return {
        label: 'Setup',
        color: '#9a3412',
        background: '#ffedd5',
        border: '#fdba74',
      }
  }
}

export default function EventResultsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [event, setEvent] = useState(null)
  const [races, setRaces] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return

    async function load() {
      setLoading(true)

      const [{ data: eventData }, { data: raceData }] = await Promise.all([
        supabase.from('events').select('*').eq('id', id).single(),
        supabase
          .from('race_events')
          .select('*')
          .eq('parent_event_id', id)
          .order('event_date', { ascending: true }),
      ])

      setEvent(eventData || null)
      setRaces(raceData || [])
      setLoading(false)
    }

    load()
  }, [id])

  const groupedRaces = useMemo(() => {
    const groups = new Map()

    races.forEach(race => {
      const key = race.event_date ? formatLongDate(race.event_date) : 'Undated Races'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(race)
    })

    return Array.from(groups.entries())
  }, [races])

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ color: '#94a3b8' }}>Loading event…</div>
      </div>
    )
  }

  if (!event) {
    return (
      <div style={pageStyle}>
        <div
          style={{
            maxWidth: 640,
            background: '#0e1318',
            border: '1px solid #1e2730',
            borderRadius: 16,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', marginBottom: 8 }}>
            Event Not Found
          </div>
          <div style={{ color: '#94a3b8' }}>
            This event could not be found.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#080b0f', color: '#e2e8f0', padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div
          style={{
            background: '#0e1318',
            border: '1px solid #1e2730',
            borderRadius: 20,
            padding: 24,
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 12, color: '#f97316', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>
            Event Hub
          </div>

          <div style={{ fontSize: 32, fontWeight: 900, color: '#f8fafc', marginBottom: 8 }}>
            {event.name}
          </div>

          <div style={{ color: '#94a3b8', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {event.location && <span>📍 {event.location}</span>}
            {getEventStartDisplay(event) && (
              <span>Start: {formatEventDisplayDate(getEventStartDisplay(event))}</span>
            )}
            {event.end_date && <span>End: {formatEventDisplayDate(event.end_date)}</span>}
            {event.sport && <span>{event.sport}</span>}
          </div>

          {user && (
            <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => navigate(`/create-race?parentEventId=${event.id}`)}
                style={primaryBtn}
              >
                Add Race
              </button>
            </div>
          )}
        </div>

        {groupedRaces.length === 0 ? (
          <div
            style={{
              background: '#0e1318',
              border: '1px solid #1e2730',
              borderRadius: 16,
              padding: 24,
              color: '#94a3b8',
            }}
          >
            No races have been added to this event yet.
          </div>
        ) : (
          groupedRaces.map(([dateLabel, items]) => (
            <div key={dateLabel} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 }}>
                {dateLabel}
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                {items.map(race => {
                  const badge = getRaceStatusMeta(race.status)

                  return (
                    <div
                      key={race.id}
                      style={{
                        background: '#0e1318',
                        border: '1px solid #1e2730',
                        borderRadius: 14,
                        padding: 18,
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 16,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc' }}>
                            {race.name}
                          </div>

                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: badge.color,
                              background: badge.background,
                              border: `1px solid ${badge.border}`,
                              borderRadius: 999,
                              padding: '5px 9px',
                            }}
                          >
                            {badge.label}
                          </span>
                        </div>

                        <div style={{ color: '#94a3b8', fontSize: 13, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {race.distance && <span>{race.distance}</span>}
                          {race.sport && <span>{race.sport}</span>}
                          {race.location && <span>📍 {race.location}</span>}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <a href={`/results/${race.id}`} style={linkBtn('#60a5fa')}>
                          Results
                        </a>

                        <a href={`/public/race/${race.id}/live-board`} style={linkBtn('#a78bfa')}>
                          Live Board
                        </a>

                        {user && (
                          <>
                            <button
                              type="button"
                              onClick={() => navigate(`/race/${race.id}/setup`)}
                              style={ghostBtn('#f97316')}
                            >
                              Race Home
                            </button>

                            <button
                              type="button"
                              onClick={() => navigate(`/race/${race.id}/monitor`)}
                              style={ghostBtn('#38bdf8')}
                            >
                              Monitor
                            </button>

                            <button
                              type="button"
                              onClick={() => navigate(`/create-race?parentEventId=${event.id}&copyRaceId=${race.id}`)}
                              style={ghostBtn('#34d399')}
                            >
                              Add Similar Race
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const pageStyle = {
  minHeight: '100dvh',
  background: '#080b0f',
  color: '#e2e8f0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
}

const primaryBtn = {
  border: 'none',
  borderRadius: 10,
  padding: '10px 14px',
  fontWeight: 700,
  cursor: 'pointer',
  color: '#fff',
  background: '#f97316',
}

function linkBtn(color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    border: '1px solid #1e2730',
    borderRadius: 10,
    padding: '10px 14px',
    color,
    background: 'transparent',
    fontWeight: 700,
  }
}

function ghostBtn(color) {
  return {
    border: '1px solid #1e2730',
    borderRadius: 10,
    padding: '10px 14px',
    fontWeight: 700,
    cursor: 'pointer',
    color,
    background: 'transparent',
  }
}