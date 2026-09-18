import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function formatEventDisplayDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString()
}

function getEventStartDisplay(event) {
  if (!event) return null
  return event.start_date || event.date || null
}

export default function EventResultsPage() {
  const { id } = useParams()
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
      const key = race.event_date
        ? new Date(race.event_date).toLocaleDateString()
        : 'No date'

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
            Event Results
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
          groupedRaces.map(([date, items]) => (
            <div key={date} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 }}>
                {date === 'No date' ? 'Undated Races' : date}
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                {items.map(race => (
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
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc', marginBottom: 4 }}>
                        {race.name}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: 13, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {race.distance && <span>{race.distance}</span>}
                        {race.sport && <span>{race.sport}</span>}
                        <span>Status: {race.status || 'draft'}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <a href={`/results/${race.id}`} style={linkBtn('#60a5fa')}>
                        Results
                      </a>
                      <a href={`/public/race/${race.id}/live-board`} style={linkBtn('#a78bfa')}>
                        Live Board
                      </a>
                    </div>
                  </div>
                ))}
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