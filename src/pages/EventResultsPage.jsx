import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../contexts/ThemeContext'
import PublicNav from '../components/PublicNav'
import PublicLiveRaceCard from '../components/PublicLiveRaceCard'
import {
  getCreateRacePath,
  getEventHubPath,
  getLiveBoardPath,
  getPublicHomePath,
  getRaceDirectorPath,
  getRaceSetupPath,
  getResultsPath,
} from '../lib/routes'

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

function getStatusColor(status, theme) {
  switch (status) {
    case 'draft':
      return {
        background: theme.cardAltBg,
        color: theme.textMuted,
        border: `1px solid ${theme.borderSoft}`,
      }
    case 'ready':
      return {
        background: theme.secondaryBg,
        color: theme.secondaryText,
        border: `1px solid ${theme.secondaryText}`,
      }
    case 'active':
      return {
        background: '#052e16',
        color: '#4ade80',
        border: '1px solid #166534',
      }
    case 'results_review':
      return {
        background: '#3b2f0b',
        color: '#fbbf24',
        border: '1px solid #92400e',
      }
    case 'finished':
      return {
        background: '#2e1065',
        color: '#c084fc',
        border: '1px solid #6b21a8',
      }
    default:
      return {
        background: theme.cardAltBg,
        color: theme.textMuted,
        border: `1px solid ${theme.borderSoft}`,
      }
  }
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

function RaceCard({ race, isAuthenticated, theme }) {
  const styles = getStyles(theme)
  const statusStyle = getStatusColor(race.status, theme)

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={styles.raceTitle}>{race.name}</div>

          <div style={styles.meta}>
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
            <div style={{ marginTop: 12, fontSize: 13, color: theme.textSoft }}>
              {race.notes}
            </div>
          ) : null}
        </div>

        <div style={styles.buttonRow}>
          <ActionLink to={getResultsPath(race.id)} theme={theme}>
            Results
          </ActionLink>

          <ActionLink to={getLiveBoardPath(race.id)} theme={theme}>
            Live Board
          </ActionLink>

          {isAuthenticated ? (
            <ActionLink to={getRaceDirectorPath(race.id)} primary theme={theme}>
              Director
            </ActionLink>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function EventResultsPage() {
  const { id } = useParams()
  const { theme, mode, setMode } = useTheme()
  const styles = getStyles(theme)
  const [searchParams, setSearchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [event, setEvent] = useState(null)
  const [races, setRaces] = useState([])
  const [session, setSession] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    async function loadPublicData() {
      setLoading(true)
      setError('')

      const [
        { data: eventData, error: eventError },
        { data: raceData, error: raceError },
      ] = await Promise.all([
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

      setEvent(eventData || null)
      setRaces(raceData || [])
      setLoading(false)
    }

    loadPublicData()

    return () => {
      mounted = false
    }
  }, [id])

  useEffect(() => {
    let mounted = true

    async function loadAuth() {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(data?.session || null)
    }

    loadAuth()

    return () => {
      mounted = false
    }
  }, [])

  const eventStartDate = normalizeLegacyEventDate(event)
  const eventEndDate = event?.end_date || null

  const sortedRaces = useMemo(() => {
    return [...races].sort((a, b) => {
      const aTime = a?.event_date ? new Date(a.event_date).getTime() : 0
      const bTime = b?.event_date ? new Date(b.event_date).getTime() : 0
      return aTime - bTime
    })
  }, [races])

  const liveRaces = useMemo(() => {
    return sortedRaces.filter(race => race.status === 'active')
  }, [sortedRaces])

  const nonLiveRaces = useMemo(() => {
    return sortedRaces.filter(race => race.status !== 'active')
  }, [sortedRaces])

  const groupedRaces = useMemo(() => groupRacesByDate(nonLiveRaces), [nonLiveRaces])

  const activeTab = searchParams.get('race') || 'overview'

  const activeRace = useMemo(() => {
    if (activeTab === 'overview') return null
    return sortedRaces.find(race => race.id === activeTab) || null
  }, [activeTab, sortedRaces])

  useEffect(() => {
    if (activeTab === 'overview') return
    if (!sortedRaces.some(race => race.id === activeTab)) {
      setSearchParams({})
    }
  }, [sortedRaces, activeTab, setSearchParams])

  function setTab(tab) {
    if (tab === 'overview') {
      setSearchParams({})
    } else {
      setSearchParams({ race: tab })
    }
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <PublicNav
          theme={theme}
          extraLinks={[{ to: getPublicHomePath(), label: 'Public Home' }]}
        />
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={styles.card}>Loading event…</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.page}>
        <PublicNav
          theme={theme}
          extraLinks={[{ to: getPublicHomePath(), label: 'Public Home' }]}
        />
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={styles.error}>{error}</div>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div style={styles.page}>
        <PublicNav
          theme={theme}
          extraLinks={[{ to: getPublicHomePath(), label: 'Public Home' }]}
        />
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={styles.card}>Event not found.</div>
        </div>
      </div>
    )
  }

  const tabButtonStyle = active => ({
    border: `1px solid ${active ? theme.secondaryText : theme.borderSoft}`,
    background: active ? theme.cardAltBg : theme.secondaryBg,
    color: active ? theme.text : theme.secondaryText,
    borderRadius: 999,
    padding: '10px 14px',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  })

  return (
    <div style={styles.page}>
      <PublicNav
        theme={theme}
        extraLinks={[
          { to: getPublicHomePath(), label: 'Public Home' },
          { to: getEventHubPath(id), label: event?.name || 'Event Hub' },
        ]}
      />

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={styles.heroCard}>
          <div style={styles.heroHeader}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={styles.kicker}>Event Hub</div>
              <div style={styles.title}>{event.name}</div>

              <div style={styles.meta}>
                {formatEventDateRange(eventStartDate, eventEndDate) ? (
                  <span>{formatEventDateRange(eventStartDate, eventEndDate)}</span>
                ) : null}
                {event.location ? <span> • {event.location}</span> : null}
                {event.sport ? <span> • {event.sport}</span> : null}
              </div>

              {event.notes ? (
                <div style={{ marginTop: 14, fontSize: 14, color: theme.textSoft }}>
                  {event.notes}
                </div>
              ) : null}
            </div>

            <div style={styles.buttonRow}>
              <ThemeToggle mode={mode} setMode={setMode} theme={theme} />

              {session ? (
                <ActionLink
                  to={getCreateRacePath({ parentEventId: event.id })}
                  primary
                  theme={theme}
                >
                  Add Race
                </ActionLink>
              ) : null}
            </div>
          </div>
        </div>

        {liveRaces.length > 0 ? (
          <section style={{ marginBottom: 24 }}>
            <div style={styles.sectionHeader}>
              <div>
                <div style={styles.sectionTitle}>Live Now</div>
                <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
                  Results are updating in real time.
                </div>
              </div>

              <div style={{ fontSize: 13, color: theme.textMuted }}>
                {liveRaces.length} live
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {liveRaces.map(race => (
                <PublicLiveRaceCard
                  key={race.id}
                  race={race}
                  theme={theme}
                  showDirector={!!session}
                />
              ))}
            </div>
          </section>
        ) : null}

        {sortedRaces.length > 0 ? (
          <section style={{ marginBottom: 20 }}>
            <div style={styles.sectionHeader}>
              <div>
                <div style={styles.sectionTitle}>Races / Divisions</div>
                <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
                  Select a race to view results and status.
                </div>
              </div>

              <div style={{ fontSize: 13, color: theme.textMuted }}>
                {sortedRaces.length} total
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                style={tabButtonStyle(activeTab === 'overview')}
                onClick={() => setTab('overview')}
              >
                Overview
              </button>

              {sortedRaces.map(race => (
                <button
                  key={race.id}
                  type="button"
                  style={tabButtonStyle(activeTab === race.id)}
                  onClick={() => setTab(race.id)}
                >
                  {race.name}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {session && activeRace ? (
          <div style={styles.organizerStrip}>
            <div style={styles.organizerStripText}>
              Organizer tools for <strong>{activeRace.name}</strong>
            </div>

            <div style={styles.organizerStripActions}>
              <Link to={getRaceDirectorPath(activeRace.id)} style={styles.organizerPrimaryLink}>
                Director
              </Link>

              <Link to={getRaceSetupPath(activeRace.id)} style={styles.organizerSecondaryLink}>
                Setup
              </Link>
            </div>
          </div>
        ) : null}

        {activeTab === 'overview' ? (
          groupedRaces.length === 0 ? (
            <div style={styles.card}>
              No races have been added to this event yet.
            </div>
          ) : (
            groupedRaces.map(group => (
              <section key={group.date} style={{ marginBottom: 28 }}>
                <div style={styles.sectionHeader}>
                  <div style={styles.sectionTitle}>{group.label}</div>
                  <div style={{ fontSize: 13, color: theme.textMuted }}>
                    {group.races.length} race{group.races.length === 1 ? '' : 's'}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 12 }}>
                  {group.races.map(race => (
                    <RaceCard
                      key={race.id}
                      race={race}
                      isAuthenticated={!!session}
                      theme={theme}
                    />
                  ))}
                </div>
              </section>
            ))
          )
        ) : activeRace ? (
          <>
            <section>
              <div style={styles.sectionHeader}>
                <div style={styles.sectionTitle}>{activeRace.name}</div>
                <div style={{ fontSize: 13, color: theme.textMuted }}>
                  Focused race view
                </div>
              </div>

              {activeRace.status === 'active' ? (
                <PublicLiveRaceCard
                  race={activeRace}
                  theme={theme}
                  showDirector={!!session}
                />
              ) : (
                <RaceCard
                  race={activeRace}
                  isAuthenticated={!!session}
                  theme={theme}
                />
              )}
            </section>

            {sortedRaces.filter(race => race.id !== activeRace.id).length > 0 ? (
              <section style={{ marginTop: 24 }}>
                <div style={styles.sectionHeader}>
                  <div>
                    <div style={styles.sectionTitle}>Other Races</div>
                    <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
                      Browse the rest of this event without returning to overview.
                    </div>
                  </div>

                  <div style={{ fontSize: 13, color: theme.textMuted }}>
                    {sortedRaces.filter(race => race.id !== activeRace.id).length} more
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 12 }}>
                  {sortedRaces
                    .filter(race => race.id !== activeRace.id)
                    .map(race => (
                      race.status === 'active' ? (
                        <PublicLiveRaceCard
                          key={race.id}
                          race={race}
                          theme={theme}
                          showDirector={!!session}
                        />
                      ) : (
                        <RaceCard
                          key={race.id}
                          race={race}
                          isAuthenticated={!!session}
                          theme={theme}
                        />
                      )
                    ))}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <div style={styles.card}>Race not found.</div>
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
    card: {
      background: theme.cardBg,
      border: `1px solid ${theme.border}`,
      borderRadius: 16,
      padding: 18,
    },
    cardHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 16,
      flexWrap: 'wrap',
    },
    heroHeader: {
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
      marginBottom: 10,
    },
    raceTitle: {
      fontSize: 20,
      fontWeight: 700,
      marginBottom: 6,
    },
    meta: {
      fontSize: 13,
      color: theme.textMuted,
      lineHeight: 1.5,
    },
    sectionHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
      flexWrap: 'wrap',
    },
    sectionTitle: {
      fontSize: 22,
      fontWeight: 800,
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
    organizerStrip: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
      marginTop: 16,
      marginBottom: 16,
      padding: '12px 14px',
      borderRadius: 12,
      border: '1px solid #1e2730',
      background: 'rgba(15,23,42,0.55)',
    },
    organizerStripText: {
      fontSize: 13,
      color: '#cbd5e1',
    },
    organizerStripActions: {
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap',
    },
    organizerPrimaryLink: {
      display: 'inline-block',
      textDecoration: 'none',
      borderRadius: 10,
      padding: '10px 14px',
      background: '#f97316',
      color: '#fff',
      fontWeight: 800,
    },
    organizerSecondaryLink: {
      display: 'inline-block',
      textDecoration: 'none',
      borderRadius: 10,
      padding: '10px 14px',
      border: '1px solid #1e2730',
      background: '#0b1220',
      color: '#60a5fa',
      fontWeight: 700,
    },
  }
}