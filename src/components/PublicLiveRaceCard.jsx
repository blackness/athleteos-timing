import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getEventHubPath,
  getLiveBoardPath,
  getRaceDirectorPath,
  getResultsPath,
} from '../lib/routes'

function formatDateTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString()
}

function formatElapsed(ms) {
  if (ms == null) return 'LIVE'

  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function PublicLiveRaceCard({
  race,
  theme,
  showEventHub = false,
  showDirector = false,
  primaryLabel = 'Results',
}) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const startedAt = race?.race_started_at ? new Date(race.race_started_at).getTime() : null
  const elapsedMs = startedAt ? Math.max(0, now - startedAt) : null

  const styles = {
    card: {
      background: theme.cardBg,
      border: '1px solid #166534',
      borderRadius: 16,
      padding: 18,
      backgroundImage: 'linear-gradient(180deg, rgba(22,163,74,0.14), rgba(22,163,74,0.04))',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 16,
      flexWrap: 'wrap',
    },
    title: {
      fontSize: 20,
      fontWeight: 700,
      marginBottom: 6,
      color: theme.text,
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
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: 8,
            }}
          >
            <div style={styles.title}>{race.name}</div>

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 800,
                background: '#052e16',
                color: '#4ade80',
                border: '1px solid #166534',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#4ade80',
                  display: 'inline-block',
                }}
              />
              Live
            </span>
          </div>

          <div style={styles.meta}>
            {race.event_date ? <span>{formatDateTime(race.event_date)}</span> : null}
            {race.location ? <span> • {race.location}</span> : null}
            {race.sport ? <span> • {race.sport}</span> : null}
            {race.distance ? <span> • {race.distance}</span> : null}
          </div>

          <div
            style={{
              marginTop: 12,
              fontSize: 28,
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              color: '#4ade80',
            }}
          >
            {formatElapsed(elapsedMs)}
          </div>
        </div>

        <div style={styles.buttonRow}>
          <Link to={getResultsPath(race.id)} style={styles.primaryButton}>
            {primaryLabel}
          </Link>

          <Link to={getLiveBoardPath(race.id)} style={styles.secondaryButton}>
            Live Board
          </Link>

          {showEventHub && race.parent_event_id ? (
            <Link to={getEventHubPath(race.parent_event_id)} style={styles.secondaryButton}>
              Event Hub
            </Link>
          ) : null}

          {showDirector ? (
            <Link to={getRaceDirectorPath(race.id)} style={styles.secondaryButton}>
              Director
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}