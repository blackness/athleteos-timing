import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../contexts/ThemeContext'
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

function getRaceStatusTone(status, theme) {
  if (status === 'active') {
    return {
      label: 'LIVE',
      color: theme.dangerTextStrong || '#dc2626',
      bg: theme.dangerSurface || 'rgba(239,68,68,0.10)',
      border: theme.dangerBorderSoft || 'rgba(239,68,68,0.25)',
    }
  }

  if (status === 'results_review') {
    return {
      label: 'REVIEW',
      color: theme.warningText || '#b45309',
      bg: theme.warningSurface || 'rgba(234,179,8,0.10)',
      border: theme.warningBorder || 'rgba(234,179,8,0.25)',
    }
  }

  if (status === 'finished') {
    return {
      label: 'FINAL',
      color: theme.successText || '#059669',
      bg: theme.successSurface || 'rgba(16,185,129,0.10)',
      border: theme.successBorder || 'rgba(16,185,129,0.25)',
    }
  }

  if (status === 'ready') {
    return {
      label: 'READY',
      color: theme.successText || '#16a34a',
      bg: theme.successSurface || 'rgba(34,197,94,0.10)',
      border: theme.successBorder || 'rgba(34,197,94,0.25)',
    }
  }

  return {
    label: 'DRAFT',
    color: theme.infoText || theme.accent || '#2563eb',
    bg: theme.infoSurface || 'rgba(96,165,250,0.10)',
    border: theme.infoBorder || 'rgba(96,165,250,0.25)',
  }
}

function ActionLink({ to, children, primary = false, danger = false, styles }) {
  let style = styles.secondaryButton
  if (primary) style = styles.primaryButton
  if (danger) style = styles.dangerButton

  return (
    <Link to={to} style={style}>
      {children}
    </Link>
  )
}

function StatusBadge({ status, theme }) {
  const tone = getRaceStatusTone(status, theme)

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

function RaceDashboardCard({ race, parentEventName, styles, theme }) {
  const status = race?.status || 'draft'

  return (
    <div style={styles.dashboardRaceCard}>
      <div style={styles.dashboardCardTop}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={styles.raceTitle}>{race.name}</div>

          <div style={styles.meta}>
            {parentEventName ? <span>{parentEventName}</span> : null}
            {race.event_date ? <span> • {formatDate(race.event_date)}</span> : null}
            {race.location ? <span> • {race.location}</span> : null}
            {race.sport ? <span> • {race.sport}</span> : null}
            {race.distance ? <span> • {race.distance}</span> : null}
          </div>
        </div>

        <StatusBadge status={status} theme={theme} />
      </div>

      <div style={styles.buttonRow}>
        <ActionLink to={getRaceDirectorPath(race.id)} styles={styles}>
          Director
        </ActionLink>

        {status === 'active' ? (
          <>
            <ActionLink to={getRaceMonitorPath(race.id)} styles={styles}>
              Monitor
            </ActionLink>
            <ActionLink to={getRaceAssignPath(race.id)} styles={styles}>
              Assign Bibs
            </ActionLink>
          </>
        ) : null}

        {status === 'results_review' ? (
          <>
            <ActionLink to={getRaceCorrectionsPath(race.id)} styles={styles}>
              Review & Fix
            </ActionLink>
            <ActionLink to={getResultsPath(race.id)} styles={styles}>
              Results
            </ActionLink>
          </>
        ) : null}

        {['draft', 'ready'].includes(status) ? (
          <ActionLink to={getRaceSetupPath(race.id)} styles={styles}>
            Setup
          </ActionLink>
        ) : null}

        {status === 'finished' ? (
          <>
            <ActionLink to={getResultsPath(race.id)} styles={styles}>
              Results
            </ActionLink>
            <ActionLink to={getLiveBoardPath(race.id)} styles={styles}>
              Live Board
            </ActionLink>
          </>
        ) : null}
      </div>
    </div>
  )
}

function ParentEventCard({ event, races, styles }) {
  const dateLabel = formatEventDateRange(event)

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={styles.sectionCardTitle}>{event.name}</div>

          <div style={styles.meta}>
            {dateLabel ? <span>{dateLabel}</span> : null}
            {event.location ? <span> • {event.location}</span> : null}
            {event.sport ? <span> • {event.sport}</span> : null}
          </div>

          {event.notes ? (
            <div style={styles.notes}>
              {event.notes}
            </div>
          ) : null}
        </div>

        <div style={styles.buttonRow}>
          <ActionLink to={getEventHubPath(event.id)} styles={styles}>
            Event Hub
          </ActionLink>
          <ActionLink to={getCreateRacePath({ parentEventId: event.id })} styles={styles}>
            Add Race
          </ActionLink>
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        {races.length === 0 ? (
          <div style={styles.emptyText}>No races in this event yet.</div>
        ) : (
          races.map(race => (
            <div key={race.id} style={styles.innerCard}>
              <div style={styles.cardHeader}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={styles.raceTitle}>{race.name}</div>
                  <div style={styles.meta}>
                    {race.event_date ? <span>{formatDate(race.event_date)}</span> : null}
                    {race.location ? <span> • {race.location}</span> : null}
                    {race.sport ? <span> • {race.sport}</span> : null}
                    {race.distance ? <span> • {race.distance}</span> : null}
                    {race.status ? <span> • {race.status}</span> : null}
                  </div>
                </div>

                <div style={styles.buttonRow}>
                  <ActionLink to={getRaceDirectorPath(race.id)} primary styles={styles}>
                    Director
                  </ActionLink>
                  <ActionLink to={getRaceSetupPath(race.id)} styles={styles}>
                    Setup
                  </ActionLink>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function StandaloneRaceCard({ race, styles }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={styles.raceTitle}>{race.name}</div>
          <div style={styles.meta}>
            {race.event_date ? <span>{formatDate(race.event_date)}</span> : null}
            {race.location ? <span> • {race.location}</span> : null}
            {race.sport ? <span> • {race.sport}</span> : null}
            {race.distance ? <span> • {race.distance}</span> : null}
            {race.status ? <span> • {race.status}</span> : null}
          </div>
        </div>

        <div style={styles.buttonRow}>
          <ActionLink to={getRaceDirectorPath(race.id)} primary styles={styles}>
            Director
          </ActionLink>
          <ActionLink to={getRaceSetupPath(race.id)} styles={styles}>
            Setup
          </ActionLink>
        </div>
      </div>
    </div>
  )
}

function DashboardSection({ title, subtitle, races, eventNameById, styles, theme }) {
  if (!races.length) return null

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={styles.sectionHeaderBlock}>
        <div style={styles.sectionTitle}>{title}</div>
        {subtitle ? <div style={styles.subtitle}>{subtitle}</div> : null}
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        {races.map(race => (
          <RaceDashboardCard
            key={race.id}
            race={race}
            parentEventName={race.parent_event_id ? eventNameById[race.parent_event_id] || null : null}
            styles={styles}
            theme={theme}
          />
        ))}
      </div>
    </section>
  )
}

export default function Events() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { theme } = useTheme()
  const styles = useMemo(() => getStyles(theme), [theme])

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
    <div style={styles.page}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={styles.heroCard}>
          <div style={styles.heroHeader}>
            <div>
              <div style={styles.eyebrow}>Organizer</div>
              <div style={styles.title}>Dashboard</div>
              <div style={styles.subtitle}>
                Open the next race that needs attention.
              </div>
            </div>

            <div style={styles.buttonRow}>
              <button
                type="button"
                onClick={() => navigate(getCreateEventPath())}
                style={styles.primaryButtonButton}
              >
                Create Event
              </button>

              <button
                type="button"
                onClick={() => navigate(getCreateRacePath())}
                style={styles.secondaryButtonButton}
              >
                Create Standalone Race
              </button>
            </div>
          </div>
        </div>

        {!user?.id ? (
          <div style={styles.card}>
            Please sign in to view your organizer dashboard.
          </div>
        ) : loading ? (
          <div style={styles.card}>Loading…</div>
        ) : error ? (
          <div style={styles.error}>{error}</div>
        ) : (
          <>
            <DashboardSection
              title="Live Now"
              subtitle="Races currently in progress."
              races={liveRaces}
              eventNameById={eventNameById}
              styles={styles}
              theme={theme}
            />

            <DashboardSection
              title="Needs Review"
              subtitle="Races waiting for results review or cleanup."
              races={reviewRaces}
              eventNameById={eventNameById}
              styles={styles}
              theme={theme}
            />

            <DashboardSection
              title="Up Next"
              subtitle="Upcoming races that are draft or ready to begin."
              races={upcomingRaces}
              eventNameById={eventNameById}
              styles={styles}
              theme={theme}
            />

            <DashboardSection
              title="Finished"
              subtitle="Completed races and final outputs."
              races={finishedRaces}
              eventNameById={eventNameById}
              styles={styles}
              theme={theme}
            />

            <section style={{ marginBottom: 32 }}>
              <div style={styles.sectionHeaderBlock}>
                <div style={styles.sectionTitle}>Parent Events</div>
                <div style={styles.subtitle}>
                  Event groups and their child races.
                </div>
              </div>

              {parentEventCards.length === 0 ? (
                <div style={styles.card}>No parent events yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: 16 }}>
                  {parentEventCards.map(({ event, races }) => (
                    <ParentEventCard key={event.id} event={event} races={races} styles={styles} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div style={styles.sectionHeaderBlock}>
                <div style={styles.sectionTitle}>Standalone Races</div>
                <div style={styles.subtitle}>
                  Races not attached to a parent event.
                </div>
              </div>

              {standaloneRaces.length === 0 ? (
                <div style={styles.card}>No standalone races.</div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {standaloneRaces.map(race => (
                    <StandaloneRaceCard key={race.id} race={race} styles={styles} />
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

function getStyles(theme) {
  return {
    page: {
      minHeight: '100dvh',
      background: theme.pageBg,
      color: theme.text,
      padding: 24,
    },

    heroCard: {
      background: theme.mode === 'light' ? '#fffaf5' : theme.cardBg,
      border: `1px solid ${theme.border}`,
      borderTop: '4px solid #f97316',
      borderRadius: 16,
      padding: 24,
      marginBottom: 24,
      boxShadow: theme.shadowSm,
    },

    card: {
      background: theme.cardBg,
      border: `1px solid ${theme.border}`,
      borderRadius: 16,
      padding: 18,
      boxShadow: theme.shadowSm,
    },

    innerCard: {
      background: theme.cardAltBg || theme.secondaryBg,
      border: `1px solid ${theme.borderSoft || theme.border}`,
      borderRadius: 12,
      padding: 16,
    },

    dashboardRaceCard: {
      background: theme.cardBg,
      border: `1px solid ${theme.border}`,
      borderRadius: 16,
      padding: 18,
      boxShadow: theme.shadowSm,
    },

    heroHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 16,
      flexWrap: 'wrap',
    },

    cardHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 16,
      flexWrap: 'wrap',
    },

    dashboardCardTop: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 16,
      marginBottom: 14,
      flexWrap: 'wrap',
    },

    sectionHeaderBlock: {
      marginBottom: 14,
    },

    title: {
      fontSize: 32,
      fontWeight: 800,
      marginBottom: 8,
      color: theme.text,
    },

    subtitle: {
      fontSize: 14,
      color: theme.textMuted,
    },
    eyebrow: {
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: '#f97316',
      marginBottom: 8,
    },
    sectionTitle: {
      fontSize: 22,
      fontWeight: 800,
      marginBottom: 6,
      color: theme.text,
    },

    sectionCardTitle: {
      fontSize: 24,
      fontWeight: 800,
      marginBottom: 6,
      color: theme.text,
    },

    raceTitle: {
      fontSize: 18,
      fontWeight: 700,
      marginBottom: 6,
      color: theme.text,
    },

    meta: {
      fontSize: 13,
      color: theme.textMuted,
      lineHeight: 1.5,
    },

    notes: {
      marginTop: 12,
      fontSize: 13,
      color: theme.textMuted,
    },

    buttonRow: {
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap',
    },

    primaryButton: {
      display: 'inline-block',
      textDecoration: 'none',
      border: 'none',
      borderRadius: 10,
      padding: '12px 16px',
      fontWeight: 800,
      background: '#f97316',
      color: '#ffffff',
      boxShadow: theme.mode === 'light'
        ? '0 1px 2px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(249, 115, 22, 0.08)'
        : 'none',
    },

    secondaryButton: {
      display: 'inline-block',
      textDecoration: 'none',
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      padding: '12px 16px',
      fontWeight: 700,
      background: theme.mode === 'light' ? '#f8fafc' : (theme.cardAltBg || theme.secondaryBg),
      color: theme.text,
      boxShadow: theme.mode === 'light'
        ? '0 1px 2px rgba(15, 23, 42, 0.04)'
        : 'none',
    },

    dangerButton: {
      display: 'inline-block',
      textDecoration: 'none',
      border: `1px solid ${theme.dangerBorder || '#ef4444'}`,
      borderRadius: 10,
      padding: '12px 16px',
      fontWeight: 700,
      background: theme.dangerSurface || 'transparent',
      color: theme.dangerText || '#dc2626',
    },

    primaryButtonButton: {
      border: 'none',
      borderRadius: 10,
      padding: '12px 16px',
      fontWeight: 800,
      cursor: 'pointer',
      background: '#f97316',
      color: '#ffffff',
      boxShadow: theme.mode === 'light'
        ? '0 1px 2px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(249, 115, 22, 0.08)'
        : 'none',
    },

    secondaryButtonButton: {
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      padding: '12px 16px',
      fontWeight: 700,
      cursor: 'pointer',
      background: theme.mode === 'light' ? '#f8fafc' : (theme.cardAltBg || theme.secondaryBg),
      color: theme.text,
      boxShadow: theme.mode === 'light'
        ? '0 1px 2px rgba(15, 23, 42, 0.04)'
        : 'none',
    },

    error: {
      background: theme.dangerSurface || 'rgba(220, 38, 38, 0.10)',
      border: `1px solid ${theme.dangerBorder || '#ef4444'}`,
      color: theme.dangerText || theme.text,
      borderRadius: 12,
      padding: 16,
    },

    emptyText: {
      fontSize: 13,
      color: theme.textMuted,
    },
  }
}