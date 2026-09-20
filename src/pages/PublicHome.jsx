import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../contexts/ThemeContext'
import {
  getEventHubPath,
  getLiveBoardPath,
  getResultsPath,
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

    if (!Number.isNaN(startTime) && !Number.isNaN(endTime) && endTime >= startTime && start !== end) {
      return `${formatDate(start)} – ${formatDate(end)}`
    }
  }

  return formatDate(start || end)
}

function sortRacesByDate(a, b) {
  const aTime = a?.event_date ? new Date(a.event_date).getTime() : 0
  const bTime = b?.event_date ? new Date(b.event_date).getTime() : 0
  return aTime - bTime
}

function ThemeToggle({ mode, setMode, theme }) {
  const styles = getStyles(theme)

  const btn = active => ({
    ...styles.secondaryButton,
    background: active ? theme.cardAltBg : theme.secondaryBg,
    color: active ? theme.text : theme.secondaryText,
  })

  return (
    <div style={styles.buttonRow}>
      <button type="button" style={btn(mode === 'light')} onClick={() => setMode('light')}>
        ☀ Light
      </button>
      <button type="button" style={btn(mode === 'dark')} onClick={() => setMode('dark')}>
        🌙 Dark
      </button>
    </div>
  )
}

function ActionLink({ to, children, primary = false, theme }) {
  const styles = getStyles(theme)

  return (
    <Link to={to} style={primary ? styles.primaryButton : styles.secondaryButton}>
      {children}
    </Link>
  )
}

function EventCard({ event, races, theme }) {
  const styles = getStyles(theme)
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
            <div style={{ marginTop: 12, fontSize: 13, color: theme.textSoft }}>
              {event.notes}
            </div>
          ) : null}
        </div>

        <div style={styles.buttonRow}>
          <ActionLink to={getEventHubPath(event.id)} primary theme={theme}>
            Open Event Hub
          </ActionLink>
        </div>
      </div>

      {races.length > 0 ? (
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          {races.map(race => (
            <div key={race.id} style={styles.innerCard}>
              <div style={styles.cardHeader}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={styles.raceTitle}>{race.name}</div>
                  <div style={styles.meta}>
                    {race.event_date ? <span>{formatDate(race.event_date)}</span> : null}
                    {race.location ? <span> • {race.location}</span> : null}
                    {race.sport ? <span> • {race.sport}</span> : null}
                    {race.distance ? <span> • {race.distance}</span> : null}
                  </div>
                </div>

                <div style={styles.buttonRow}>
                  <ActionLink to={getResultsPath(race.id)} theme={theme}>Results</ActionLink>
                  <ActionLink to={getLiveBoardPath(race.id)} theme={theme}>Live Board</ActionLink>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function StandaloneRaceCard({ race, theme }) {
  const styles = getStyles(theme)

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
          </div>
        </div>

        <div style={styles.buttonRow}>
          <ActionLink to={getResultsPath(race.id)} theme={theme}>Results</ActionLink>
          <ActionLink to={getLiveBoardPath(race.id)} theme={theme}>Live Board</ActionLink>
        </div>
      </div>
    </div>
  )
}

export default function PublicHome() {
  const { theme, mode, setMode } = useTheme()
  const styles = getStyles(theme)

  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState([])
  const [races, setRaces] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    async function load() {
      setLoading(true)
      setError('')

      const [
        { data: eventsData, error: eventsError },
        { data: racesData, error: racesError },
      ] = await Promise.all([
        supabase
          .from('events')
          .select('*')
          .eq('is_public', true),
        supabase
          .from('race_events')
          .select('*')
          .eq('is_public', true)
          .order('event_date', { ascending: true }),
      ])

      if (!mounted) return

      if (eventsError || racesError) {
        setError(eventsError?.message || racesError?.message || 'Failed to load public events.')
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
  }, [])

  const { eventCards, standaloneRaces } = useMemo(() => {
    const grouped = new Map()
    const standalone = []

    for (const race of races || []) {
      if (race.parent_event_id) {
        if (!grouped.has(race.parent_event_id)) {
          grouped.set(race.parent_event_id, [])
        }
        grouped.get(race.parent_event_id).push(race)
      } else {
        standalone.push(race)
      }
    }

    const cards = (events || []).map(event => ({
      event,
      races: (grouped.get(event.id) || []).slice().sort(sortRacesByDate),
    }))

    standalone.sort(sortRacesByDate)

    return {
      eventCards: cards,
      standaloneRaces: standalone,
    }
  }, [events, races])

  return (
    <div style={styles.page}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={styles.heroCard}>
          <div style={styles.heroHeader}>
            <div>
              <div style={styles.kicker}>AthleteOS</div>
              <div style={styles.title}>Live Events & Results</div>
              <div style={styles.subtitle}>
                Browse public event hubs, standalone race results, and live boards.
              </div>
            </div>

            <ThemeToggle mode={mode} setMode={setMode} theme={theme} />
          </div>
        </div>

        {loading ? (
          <div style={styles.card}>Loading…</div>
        ) : error ? (
          <div style={styles.error}>{error}</div>
        ) : (
          <>
            <section style={{ marginBottom: 32 }}>
              <div style={styles.sectionHeaderBlock}>
                <div style={styles.sectionTitle}>Events</div>
                <div style={styles.subtitle}>
                  Multi-race public event hubs.
                </div>
              </div>

              {eventCards.length === 0 ? (
                <div style={styles.card}>No public events yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: 16 }}>
                  {eventCards.map(({ event, races }) => (
                    <EventCard key={event.id} event={event} races={races} theme={theme} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div style={styles.sectionHeaderBlock}>
                <div style={styles.sectionTitle}>Standalone Races</div>
                <div style={styles.subtitle}>
                  Public races not attached to an event hub.
                </div>
              </div>

              {standaloneRaces.length === 0 ? (
                <div style={styles.card}>No standalone public races.</div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {standaloneRaces.map(race => (
                    <StandaloneRaceCard key={race.id} race={race} theme={theme} />
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
      background: theme.cardBg,
      border: `1px solid ${theme.border}`,
      borderRadius: 16,
      padding: 24,
      marginBottom: 24,
    },
    heroHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 16,
      flexWrap: 'wrap',
    },
    card: {
      background: theme.cardBg,
      border: `1px solid ${theme.border}`,
      borderRadius: 16,
      padding: 18,
    },
    innerCard: {
      background: theme.cardAltBg,
      border: `1px solid ${theme.borderSoft}`,
      borderRadius: 12,
      padding: 16,
    },
    cardHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 16,
      flexWrap: 'wrap',
    },
    kicker: {
      fontSize: 12,
      fontWeight: 800,
      color: theme.secondaryText,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: 8,
    },
    title: {
      fontSize: 32,
      fontWeight: 800,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: theme.textMuted,
    },
    sectionHeaderBlock: {
      marginBottom: 14,
    },
    sectionTitle: {
      fontSize: 22,
      fontWeight: 800,
      marginBottom: 6,
    },
    sectionCardTitle: {
      fontSize: 24,
      fontWeight: 800,
      marginBottom: 6,
    },
    raceTitle: {
      fontSize: 18,
      fontWeight: 700,
      marginBottom: 6,
    },
    meta: {
      fontSize: 13,
      color: theme.textMuted,
      lineHeight: 1.5,
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
      background: theme.primary,
      color: theme.primaryText,
    },
    secondaryButton: {
      display: 'inline-block',
      textDecoration: 'none',
      border: `1px solid ${theme.borderSoft}`,
      borderRadius: 10,
      padding: '12px 16px',
      fontWeight: 700,
      background: theme.secondaryBg,
      color: theme.secondaryText,
      cursor: 'pointer',
    },
    error: {
      background: theme.dangerBg,
      border: `1px solid ${theme.dangerBorder}`,
      color: theme.dangerText,
      borderRadius: 12,
      padding: 16,
    },
  }
}