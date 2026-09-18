import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString()
}

function formatDateTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString()
}

function normalizeLegacyEventDate(event) {
  if (!event) return null
  if (event.start_date) return event.start_date
  if (event.date && typeof event.date === 'string') return event.date.slice(0, 10)
  return null
}

function formatEventDateRange(start, end) {
  if (!start && !end) return ''
  if (start && end && start !== end) {
    return `${formatDate(start)} – ${formatDate(end)}`
  }
  return formatDate(start || end)
}

function groupRacesByDate(races) {
  const groups = new Map()

  for (const race of races || []) {
    const key = race?.event_date ? String(race.event_date).slice(0, 10) : 'undated'
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key).push(race)
  }

  return Array.from(groups.entries())
    .map(([date, items]) => ({
      date,
      label: date === 'undated' ? 'TBD' : formatDate(date),
      races: items.slice().sort((a, b) => {
        const aTime = a?.event_date ? new Date(a.event_date).getTime() : 0
        const bTime = b?.event_date ? new Date(b.event_date).getTime() : 0
        return aTime - bTime
      }),
    }))
    .sort((a, b) => {
      if (a.date === 'undated') return 1
      if (b.date === 'undated') return -1
      return new Date(a.date).getTime() - new Date(b.date).getTime()
    })
}

function getStatusColor(status) {
  switch (status) {
    case 'draft':
      return { background: '#111827', color: '#9ca3af', border: '1px solid #1f2937' }
    case 'ready':
      return { background: '#0b1220', color: '#60a5fa', border: '1px solid #1e3a8a' }
    case 'active':
      return { background: '#052e16', color: '#4ade80', border: '1px solid #166534' }
    case 'results_review':
      return { background: '#3b2f0b', color: '#fbbf24', border: '1px solid #92400e' }
    case 'finished':
      return { background: '#2e1065', color: '#c084fc', border: '1px solid #6b21a8' }
    default:
      return { background: '#111827', color: '#94a3b8', border: '1px solid #1f2937' }
  }
}

function ActionLink({ to, children, primary = false }) {
  return (
    <Link
      to={to}
      style={primary ? primaryButtonStyle : secondaryButtonStyle}
    >
      {children}
    </Link>
  )
}

function RaceCard({ race, eventId, isAuthenticated }) {
  const statusStyle = getStatusColor(race.status)

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={raceTitleStyle}>{race.name}</div>

          <div style={metaStyle}>
            {race.event_date ? <span>{formatDateTime(race.event_date)}</span> : null}
            {race.location ? <span> • {race.location}</span> : null}
            {race.sport ? <span> • {race.sport}</span> : null}
            {race.distance ? <span> • {race.distance}</span> : null}
          </div>

          <div style={{ marginTop: 10 }}>
            <span
              style={{
                display: 'inline-block',
                padding: '6px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                ...statusStyle,
              }}
            >
              {race.status || 'unknown'}
            </span>
          </div>

          {race.notes ? (
            <div style={{ marginTop: 12, fontSize: 13, color: '#cbd5e1' }}>
              {race.notes}
            </div>
          ) : null}
        </div>

        <div style={buttonRowStyle}>
          <ActionLink to={`/race/${race.id}/results`}>Results</ActionLink>
          <ActionLink to={`/race/${race.id}/live`}>Live Board</ActionLink>

          {isAuthenticated ? (
            <>
              <ActionLink to={`/race/${race.id}`}>Race Home</ActionLink>
              <ActionLink to={`/race/${race.id}/monitor`}>Monitor</ActionLink>
              <ActionLink to={`/create-race?parentEventId=${eventId}&copyRaceId=${race.id}`}>
                Add Similar Race
              </ActionLink>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function EventResultsPage() {
  const { id } = useParams()

  const [loading, setLoading] = useState(true)
  const [event, setEvent] = useState(null)
  const [races, setRaces] = useState([])
  const [session, setSession] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    async function load() {
      setLoading(true)
      setError('')

      const [
        { data: sessionData },
        { data: eventData, error: eventError },
        { data: raceData, error: raceError },
      ] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from('events').select('*').eq('id', id).single(),
        supabase
          .from('race_events')
          .select('*')
          .eq('parent_event_id', id)
          .order('event_date', { ascending: true }),
      ])

      if (!mounted) return

      if (eventError) {
        setError(eventError.message || 'Failed to load event.')
        setLoading(false)
        return
      }

      if (raceError) {
        setError(raceError.message || 'Failed to load races.')
        setLoading(false)
        return
      }

      setSession(sessionData?.session || null)
      setEvent(eventData || null)
      setRaces(raceData || [])
      setLoading(false)
    }

    load()

    return () => {
      mounted = false
    }
  }, [id])

  const eventStartDate = normalizeLegacyEventDate(event)
  const eventEndDate = event?.end_date || null
  const groupedRaces = useMemo(() => groupRacesByDate(races), [races])

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={cardStyle}>Loading event…</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={errorStyle}>{error}</div>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={cardStyle}>Event not found.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={heroCardStyle}>
          <div style={heroHeaderStyle}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={kickerStyle}>Event Hub</div>
              <div style={titleStyle}>{event.name}</div>

              <div style={metaStyle}>
                {formatEventDateRange(eventStartDate, eventEndDate) ? (
                  <span>{formatEventDateRange(eventStartDate, eventEndDate)}</span>
                ) : null}
                {event.location ? <span> • {event.location}</span> : null}
                {event.sport ? <span> • {event.sport}</span> : null}
              </div>

              {event.notes ? (
                <div style={{ marginTop: 14, fontSize: 14, color: '#cbd5e1' }}>
                  {event.notes}
                </div>
              ) : null}
            </div>

            <div style={buttonRowStyle}>
              {session ? (
                <ActionLink to={`/create-race?parentEventId=${event.id}`} primary>
                  Add Race
                </ActionLink>
              ) : null}
            </div>
          </div>
        </div>

        {groupedRaces.length === 0 ? (
          <div style={cardStyle}>
            No races have been added to this event yet.
          </div>
        ) : (
          groupedRaces.map(group => (
            <section key={group.date} style={{ marginBottom: 28 }}>
              <div style={sectionHeaderStyle}>
                <div style={sectionTitleStyle}>{group.label}</div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>
                  {group.races.length} race{group.races.length === 1 ? '' : 's'}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                {group.races.map(race => (
                  <RaceCard
                    key={race.id}
                    race={race}
                    eventId={event.id}
                    isAuthenticated={!!session}
                  />
                ))}
              </div>
            </section>
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
  padding: 24,
}

const heroCardStyle = {
  background: '#0e1318',
  border: '1px solid #1a2030',
  borderRadius: 16,
  padding: 24,
  marginBottom: 24,
}

const cardStyle = {
  background: '#0e1318',
  border: '1px solid #1a2030',
  borderRadius: 16,
  padding: 18,
}

const cardHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  flexWrap: 'wrap',
}

const heroHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  flexWrap: 'wrap',
}

const kickerStyle = {
  fontSize: 12,
  fontWeight: 800,
  color: '#60a5fa',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 8,
}

const titleStyle = {
  fontSize: 32,
  fontWeight: 800,
  marginBottom: 10,
}

const raceTitleStyle = {
  fontSize: 20,
  fontWeight: 700,
  marginBottom: 6,
}

const metaStyle = {
  fontSize: 13,
  color: '#94a3b8',
  lineHeight: 1.5,
}

const sectionHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  marginBottom: 12,
  flexWrap: 'wrap',
}

const sectionTitleStyle = {
  fontSize: 22,
  fontWeight: 800,
}

const buttonRowStyle = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
}

const primaryButtonStyle = {
  display: 'inline-block',
  textDecoration: 'none',
  border: 'none',
  borderRadius: 10,
  padding: '12px 16px',
  fontWeight: 800,
  background: '#f97316',
  color: '#fff',
}

const secondaryButtonStyle = {
  display: 'inline-block',
  textDecoration: 'none',
  border: '1px solid #1e2730',
  borderRadius: 10,
  padding: '12px 16px',
  fontWeight: 700,
  background: '#0b1220',
  color: '#60a5fa',
}

const errorStyle = {
  background: '#2a0f13',
  border: '1px solid #7f1d1d',
  color: '#fca5a5',
  borderRadius: 12,
  padding: 16,
}