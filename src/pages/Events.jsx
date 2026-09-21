import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import {
  getCreateEventPath,
  getCreateRacePath,
  getEventHubPath,
  getLiveBoardPath,
  getRaceMonitorPath,
  getRaceSetupPath,
  getResultsPath,
  getRaceDirectorPath,
  getRaceAssignPath,
  getRaceCorrectionsPath,
} from '../lib/routes'

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString()
}

function normalizeEventStartDate(event) {
  if (!event) return null
  if (event.start_date) return event.start_date
  if (event.date && typeof event.date === 'string') return event.date.slice(0, 10)
  return null
}

function formatEventDateRange(event) {
  const start = normalizeEventStartDate(event)
  const end = event?.end_date || null

  if (!start && !end) return ''

  if (start && end) {
    const startTime = new Date(start).getTime()
    const endTime = new Date(end).getTime()

    if (!Number.isNaN(startTime) && !Number.isNaN(endTime)) {
      if (endTime < startTime) {
        return formatDate(start)
      }
      if (start !== end) {
        return `${formatDate(start)} – ${formatDate(end)}`
      }
    }
  }

  return formatDate(start || end)
}

function sortRacesByDate(a, b) {
  const aTime = a?.event_date ? new Date(a.event_date).getTime() : 0
  const bTime = b?.event_date ? new Date(b.event_date).getTime() : 0
  return aTime - bTime
}

function getRaceStatusTone(status) {
  if (status === 'active') {
    return {
      label: 'LIVE',
      color: '#ef4444',
      bg: 'rgba(239,68,68,0.10)',
      border: 'rgba(239,68,68,0.25)',
    }
  }

  if (status === 'results_review') {
    return {
      label: 'REVIEW',
      color: '#eab308',
      bg: 'rgba(234,179,8,0.10)',
      border: 'rgba(234,179,8,0.25)',
    }
  }

  if (status === 'finished') {
    return {
      label: 'FINAL',
      color: '#10b981',
      bg: 'rgba(16,185,129,0.10)',
      border: 'rgba(16,185,129,0.25)',
    }
  }

  if (status === 'ready') {
    return {
      label: 'READY',
      color: '#22c55e',
      bg: 'rgba(34,197,94,0.10)',
      border: 'rgba(34,197,94,0.25)',
    }
  }

  return {
    label: 'DRAFT',
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.10)',
    border: 'rgba(96,165,250,0.25)',
  }
}

function ActionLink({ to, children, primary = false, danger = false }) {
  let style = secondaryButtonStyle
  if (primary) style = primaryButtonStyle
  if (danger) style = dangerButtonStyle

  return (
    <Link to={to} style={style}>
      {children}
    </Link>
  )
}

function StatusBadge({ status }) {
  const tone = getRaceStatusTone(status)

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '5px 10px',
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.color,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 1.3,
      }}
    >
      {tone.label}
    </span>
  )
}

function RaceDashboardCard({ race, parentEventName }) {
  const status = race?.status || 'draft'

  return (
    <div style={dashboardRaceCardStyle}>
      <div style={dashboardCardTopStyle}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={raceTitleStyle}>{race.name}</div>

          <div style={metaStyle}>
            {parentEventName ? <span>{parentEventName}</span> : null}
            {race.event_date ? <span> • {formatDate(race.event_date)}</span> : null}
            {race.location ? <span> • {race.location}</span> : null}
            {race.sport ? <span> • {race.sport}</span> : null}
            {race.distance ? <span> • {race.distance}</span> : null}
          </div>
        </div>

        <StatusBadge status={status} />
      </div>

      <div style={buttonRowStyle}>
        <ActionLink to={getRaceDirectorPath(race.id)} primary>
          Director
        </ActionLink>

        {status === 'active' ? (
          <>
            <ActionLink to={getRaceMonitorPath(race.id)}>Monitor</ActionLink>
            <ActionLink to={getRaceAssignPath(race.id)}>Assign Bibs</ActionLink>
          </>
        ) : null}

        {status === 'results_review' ? (
          <>
            <ActionLink to={getRaceCorrectionsPath(race.id)}>Review & Fix</ActionLink>
            <ActionLink to={getResultsPath(race.id)}>Results</ActionLink>
          </>
        ) : null}

        {['draft', 'ready'].includes(status) ? (
          <ActionLink to={getRaceSetupPath(race.id)}>Setup</ActionLink>
        ) : null}

        {status === 'finished' ? (
          <>
            <ActionLink to={getResultsPath(race.id)}>Results</ActionLink>
            <ActionLink to={getLiveBoardPath(race.id)}>Live Board</ActionLink>
          </>
        ) : null}
      </div>
    </div>
  )
}

function ParentEventCard({ event, races }) {
  const dateLabel = formatEventDateRange(event)

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={sectionCardTitleStyle}>{event.name}</div>

          <div style={metaStyle}>
            {dateLabel ? <span>{dateLabel}</span> : null}
            {event.location ? <span> • {event.location}</span> : null}
            {event.sport ? <span> • {event.sport}</span> : null}
          </div>

          {event.notes ? (
            <div style={{ marginTop: 12, fontSize: 13, color: '#cbd5e1' }}>
              {event.notes}
            </div>
          ) : null}
        </div>

        <div style={buttonRowStyle}>
          <ActionLink to={getEventHubPath(event.id)}>Event Hub</ActionLink>
          <ActionLink to={getCreateRacePath({ parentEventId: event.id })}>Add Race</ActionLink>
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        {races.length === 0 ? (
          <div style={emptyTextStyle}>No races in this event yet.</div>
        ) : (
          races.map(race => (
            <div key={race.id} style={innerCardStyle}>
              <div style={cardHeaderStyle}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={raceTitleStyle}>{race.name}</div>
                  <div style={metaStyle}>
                    {race.event_date ? <span>{formatDate(race.event_date)}</span> : null}
                    {race.location ? <span> • {race.location}</span> : null}
                    {race.sport ? <span> • {race.sport}</span> : null}
                    {race.distance ? <span> • {race.distance}</span> : null}
                    {race.status ? <span> • {race.status}</span> : null}
                  </div>
                </div>

                <div style={buttonRowStyle}>
                  <ActionLink to={getRaceDirectorPath(race.id)} primary>
                    Director
                  </ActionLink>
                  <ActionLink to={getRaceSetupPath(race.id)}>Setup</ActionLink>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function StandaloneRaceCard({ race }) {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={raceTitleStyle}>{race.name}</div>
          <div style={metaStyle}>
            {race.event_date ? <span>{formatDate(race.event_date)}</span> : null}
            {race.location ? <span> • {race.location}</span> : null}
            {race.sport ? <span> • {race.sport}</span> : null}
            {race.distance ? <span> • {race.distance}</span> : null}
            {race.status ? <span> • {race.status}</span> : null}
          </div>
        </div>

        <div style={buttonRowStyle}>
          <ActionLink to={getRaceDirectorPath(race.id)} primary>
            Director
          </ActionLink>
          <ActionLink to={getRaceSetupPath(race.id)}>Setup</ActionLink>
        </div>
      </div>
    </div>
  )
}

function DashboardSection({ title, subtitle, races, eventNameById }) {
  if (!races.length) return null

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={sectionHeaderBlockStyle}>
        <div style={sectionTitleStyle}>{title}</div>
        {subtitle ? <div style={subtitleStyle}>{subtitle}</div> : null}
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        {races.map(race => (
          <RaceDashboardCard
            key={race.id}
            race={race}
            parentEventName={race.parent_event_id ? eventNameById[race.parent_event_id] || null : null}
          />
        ))}
      </div>
    </section>
  )
}

export default function Events() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState([])
  const [races, setRaces] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    async function load() {
      if (!user?.id) {
        if (!mounted) return
        setEvents([])
        setRaces([])
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      const [
        { data: eventsData, error: eventsError },
        { data: racesData, error: racesError },
      ] = await Promise.all([
        supabase
          .from('events')
          .select('*')
          .eq('user_id', user.id),
        supabase
          .from('race_events')
          .select('*')
          .eq('user_id', user.id)
          .order('event_date', { ascending: true }),
      ])

      if (!mounted) return

      if (eventsError || racesError) {
        setError(eventsError?.message || racesError?.message || 'Failed to load dashboard.')
        setLoading(false)
        return
      }

      const normalizedEvents = (eventsData || []).slice().sort((a, b) => {
        const aValue = normalizeEventStartDate(a) || ''
        const bValue = normalizeEventStartDate(b) || ''
        return new Date(aValue).getTime() - new Date(bValue).getTime()
      })

      setEvents(normalizedEvents)
      setRaces(racesData || [])
      setLoading(false)
    }

    load()

    return () => {
      mounted = false
    }
  }, [user?.id])

  const {
    parentEventCards,
    standaloneRaces,
    liveRaces,
    reviewRaces,
    upcomingRaces,
    finishedRaces,
    eventNameById,
  } = useMemo(() => {
    const eventMap = new Map((events || []).map(event => [event.id, event]))
    const grouped = new Map()
    const standalone = []

    for (const race of races || []) {
      if (race.parent_event_id && eventMap.has(race.parent_event_id)) {
        if (!grouped.has(race.parent_event_id)) {
          grouped.set(race.parent_event_id, [])
        }
        grouped.get(race.parent_event_id).push(race)
      } else {
        standalone.push(race)
      }
    }

    const parentCards = (events || []).map(event => ({
      event,
      races: (grouped.get(event.id) || []).slice().sort(sortRacesByDate),
    }))

    standalone.sort(sortRacesByDate)

    const sortedRaces = (races || []).slice().sort(sortRacesByDate)

    const live = sortedRaces.filter(r => r.status === 'active')
    const review = sortedRaces.filter(r => r.status === 'results_review')
    const upcoming = sortedRaces.filter(r => ['draft', 'ready'].includes(r.status || 'draft'))
    const finished = sortedRaces.filter(r => r.status === 'finished')

    return {
      parentEventCards: parentCards,
      standaloneRaces: standalone,
      liveRaces: live,
      reviewRaces: review,
      upcomingRaces: upcoming,
      finishedRaces: finished,
      eventNameById: Object.fromEntries((events || []).map(event => [event.id, event.name])),
    }
  }, [events, races])

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={heroCardStyle}>
          <div style={heroHeaderStyle}>
            <div>
              <div style={titleStyle}>Organizer Dashboard</div>
              <div style={subtitleStyle}>
                Open the next race that needs attention.
              </div>
            </div>

            <div style={buttonRowStyle}>
              <button
                type="button"
                onClick={() => navigate(getCreateEventPath())}
                style={primaryButtonButtonStyle}
              >
                Create Event
              </button>

              <button
                type="button"
                onClick={() => navigate(getCreateRacePath())}
                style={secondaryButtonButtonStyle}
              >
                Create Standalone Race
              </button>
            </div>
          </div>
        </div>

        {!user?.id ? (
          <div style={cardStyle}>
            Please sign in to view your organizer dashboard.
          </div>
        ) : loading ? (
          <div style={cardStyle}>Loading…</div>
        ) : error ? (
          <div style={errorStyle}>{error}</div>
        ) : (
          <>
            <DashboardSection
              title="Live Now"
              subtitle="Races currently in progress."
              races={liveRaces}
              eventNameById={eventNameById}
            />

            <DashboardSection
              title="Needs Review"
              subtitle="Races waiting for results review or cleanup."
              races={reviewRaces}
              eventNameById={eventNameById}
            />

            <DashboardSection
              title="Up Next"
              subtitle="Upcoming races that are draft or ready to begin."
              races={upcomingRaces}
              eventNameById={eventNameById}
            />

            <DashboardSection
              title="Finished"
              subtitle="Completed races and final outputs."
              races={finishedRaces}
              eventNameById={eventNameById}
            />

            <section style={{ marginBottom: 32 }}>
              <div style={sectionHeaderBlockStyle}>
                <div style={sectionTitleStyle}>Parent Events</div>
                <div style={subtitleStyle}>
                  Event groups and their child races.
                </div>
              </div>

              {parentEventCards.length === 0 ? (
                <div style={cardStyle}>No parent events yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: 16 }}>
                  {parentEventCards.map(({ event, races }) => (
                    <ParentEventCard key={event.id} event={event} races={races} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div style={sectionHeaderBlockStyle}>
                <div style={sectionTitleStyle}>Standalone Races</div>
                <div style={subtitleStyle}>
                  Races not attached to a parent event.
                </div>
              </div>

              {standaloneRaces.length === 0 ? (
                <div style={cardStyle}>No standalone races.</div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {standaloneRaces.map(race => (
                    <StandaloneRaceCard key={race.id} race={race} />
                  ))}
                </div>
              )}
            </section>
          </>
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

const innerCardStyle = {
  background: '#080b0f',
  border: '1px solid #1e2730',
  borderRadius: 12,
  padding: 16,
}

const dashboardRaceCardStyle = {
  background: '#0e1318',
  border: '1px solid #1a2030',
  borderRadius: 16,
  padding: 18,
}

const heroHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  flexWrap: 'wrap',
}

const cardHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  flexWrap: 'wrap',
}

const dashboardCardTopStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  marginBottom: 14,
  flexWrap: 'wrap',
}

const sectionHeaderBlockStyle = {
  marginBottom: 14,
}

const titleStyle = {
  fontSize: 32,
  fontWeight: 800,
  marginBottom: 8,
}

const subtitleStyle = {
  fontSize: 14,
  color: '#94a3b8',
}

const sectionTitleStyle = {
  fontSize: 22,
  fontWeight: 800,
  marginBottom: 6,
}

const sectionCardTitleStyle = {
  fontSize: 24,
  fontWeight: 800,
  marginBottom: 6,
}

const raceTitleStyle = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 6,
}

const metaStyle = {
  fontSize: 13,
  color: '#94a3b8',
  lineHeight: 1.5,
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

const dangerButtonStyle = {
  display: 'inline-block',
  textDecoration: 'none',
  border: '1px solid rgba(239,68,68,0.25)',
  borderRadius: 10,
  padding: '12px 16px',
  fontWeight: 700,
  background: 'transparent',
  color: '#f87171',
}

const primaryButtonButtonStyle = {
  border: 'none',
  borderRadius: 10,
  padding: '12px 16px',
  fontWeight: 800,
  cursor: 'pointer',
  background: '#f97316',
  color: '#fff',
}

const secondaryButtonButtonStyle = {
  border: '1px solid #1e2730',
  borderRadius: 10,
  padding: '12px 16px',
  fontWeight: 700,
  cursor: 'pointer',
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

const emptyTextStyle = {
  fontSize: 13,
  color: '#94a3b8',
}