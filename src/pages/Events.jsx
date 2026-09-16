import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '../lib/supabase'

function getPrimaryAction(event) {
  if (event.status === 'active') {
    return {
      label: 'Run Race',
      path: `/race/${event.id}/setup`,
      color: '#22c55e',
      background: 'rgba(34,197,94,0.08)',
    }
  }

  if (event.status === 'results_review') {
    return {
      label: 'Review Results',
      path: `/race/${event.id}/setup`,
      color: '#eab308',
      background: 'rgba(234,179,8,0.10)',
    }
  }

  if (event.status === 'finished') {
    return {
      label: 'View Final Results',
      path: `/results/${event.id}`,
      color: '#94a3b8',
      background: 'rgba(148,163,184,0.06)',
    }
  }

  return {
    label: 'Open Race',
    path: `/race/${event.id}/setup`,
    color: '#f97316',
    background: 'transparent',
  }
}

function getNextStepText(event) {
  if (event.status === 'active') {
    return 'Race is live. Use Race Home to manage timing and watch progress.'
  }

  if (event.status === 'results_review') {
    return 'Review results, fix any issues, then finalize the race.'
  }

  if (event.status === 'finished') {
    return 'Results are final and ready to view or share.'
  }

  return 'Finish setup, confirm timer devices, then start the race.'
}

function getStatusBadge(event) {
  if (event.status === 'active') {
    return {
      label: 'Live',
      color: '#166534',
      background: '#dcfce7',
      border: '#86efac',
    }
  }

  if (event.status === 'results_review') {
    return {
      label: 'Results Review',
      color: '#854d0e',
      background: '#fef9c3',
      border: '#fde68a',
    }
  }

  if (event.status === 'finished') {
    return {
      label: 'Final',
      color: '#475569',
      background: '#f1f5f9',
      border: '#cbd5e1',
    }
  }

  return {
    label: 'Setup',
    color: '#9a3412',
    background: '#ffedd5',
    border: '#fdba74',
  }
}

function formatEventDate(value) {
  if (!value) return 'No date set'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date set'

  return date.toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatUpdatedAt(value) {
  if (!value) return null

  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true })
  } catch {
    return null
  }
}

function EventCard({ event, onOpen, onDelete, deletingId }) {
  const navigate = useNavigate()
  const primaryAction = getPrimaryAction(event)
  const badge = getStatusBadge(event)
  const updatedAtLabel = formatUpdatedAt(event.updated_at)

  const finisherCount =
    event.finisher_count ??
    event.finishers_count ??
    event.results_count ??
    event.completed_count ??
    0

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: 18,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#0f172a',
              lineHeight: 1.2,
              wordBreak: 'break-word',
            }}
          >
            {event.name || 'Untitled Race'}
          </div>

          {(event.location || updatedAtLabel) && (
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: '#64748b',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              {event.location && <span>{event.location}</span>}
              {updatedAtLabel && <span>Updated {updatedAtLabel}</span>}
            </div>
          )}
        </div>

        <div
          style={{
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 700,
            color: badge.color,
            background: badge.background,
            border: `1px solid ${badge.border}`,
            borderRadius: 999,
            padding: '6px 10px',
          }}
        >
          {badge.label}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 14,
          fontSize: 13,
          color: '#475569',
        }}
      >
        <div>
          <span style={{ color: '#94a3b8' }}>Date:</span> {formatEventDate(event.event_date || event.date)}
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>Finishers:</span> {finisherCount}
        </div>
        {event.type && (
          <div>
            <span style={{ color: '#94a3b8' }}>Type:</span> {event.type}
          </div>
        )}
      </div>

      <div style={{ color: '#64748b', fontSize: 12 }}>
        {getNextStepText(event)}
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <button
          type="button"
          onClick={() => onOpen(primaryAction.path)}
          style={{
            border: 'none',
            borderRadius: 10,
            padding: '10px 14px',
            fontWeight: 700,
            cursor: 'pointer',
            color: primaryAction.color,
            background: primaryAction.background,
          }}
        >
          {primaryAction.label}
        </button>

        <button
          type="button"
          onClick={() => navigate(`/race/${event.id}/checkpoints`)}
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            padding: '10px 14px',
            fontWeight: 600,
            cursor: 'pointer',
            color: '#334155',
            background: '#fff',
          }}
        >
          Timer Devices
        </button>

        <button
          type="button"
          onClick={() => navigate(`/race/${event.id}/monitor`)}
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            padding: '10px 14px',
            fontWeight: 600,
            cursor: 'pointer',
            color: '#334155',
            background: '#fff',
          }}
        >
          Live View
        </button>

        <button
          type="button"
          onClick={() => navigate(`/results/${event.id}`)}
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            padding: '10px 14px',
            fontWeight: 600,
            cursor: 'pointer',
            color: '#334155',
            background: '#fff',
          }}
        >
          Results
        </button>

        <button
          type="button"
          onClick={() => onDelete(event)}
          disabled={deletingId === event.id}
          style={{
            border: '1px solid #fecaca',
            borderRadius: 10,
            padding: '10px 14px',
            fontWeight: 600,
            cursor: deletingId === event.id ? 'not-allowed' : 'pointer',
            color: '#b91c1c',
            background: '#fff5f5',
            opacity: deletingId === event.id ? 0.6 : 1,
          }}
        >
          {deletingId === event.id ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </div>
  )
}

export default function Events() {
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  async function loadEvents() {
    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('race_events')
      .select('*')
      .order('event_date', { ascending: true, nullsFirst: false })

    if (error) {
      setError(error.message || 'Failed to load races.')
      setEvents([])
      setLoading(false)
      return
    }

    setEvents(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadEvents()

    const channel = supabase
      .channel('race-events-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'race_events' },
        () => {
          loadEvents()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const activeEvent = useMemo(
    () => events.find(event => event.status === 'active') || null,
    [events]
  )

  const reviewEvent = useMemo(
    () => events.find(event => event.status === 'results_review') || null,
    [events]
  )

  const sortedEvents = useMemo(() => {
    const statusRank = {
      active: 0,
      results_review: 1,
      draft: 2,
      ready: 2,
      finished: 3,
    }

    return [...events].sort((a, b) => {
      const rankA = statusRank[a.status] ?? 99
      const rankB = statusRank[b.status] ?? 99

      if (rankA !== rankB) return rankA - rankB

      const dateA = a.event_date ? new Date(a.event_date).getTime() : 0
      const dateB = b.event_date ? new Date(b.event_date).getTime() : 0

      return dateA - dateB
    })
  }, [events])

  async function handleDelete(event) {
    const confirmed = window.confirm(
      `Delete "${event.name || 'this race'}"? This cannot be undone.`
    )

    if (!confirmed) return

    setDeletingId(event.id)

    const { error } = await supabase
      .from('race_events')
      .delete()
      .eq('id', event.id)

    if (error) {
      window.alert(error.message || 'Failed to delete race.')
      setDeletingId(null)
      return
    }

    setEvents(current => current.filter(item => item.id !== event.id))
    setDeletingId(null)
  }

  function openPath(path) {
    navigate(path)
  }

  return (
    <div
      style={{
        padding: 20,
        maxWidth: 1100,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)',
          border: '1px solid #fed7aa',
          borderRadius: 20,
          padding: 20,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: 16,
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: '#0f172a',
              lineHeight: 1.1,
            }}
          >
            {activeEvent
              ? `Current Race: ${activeEvent.name}`
              : reviewEvent
                ? `Reviewing Results: ${reviewEvent.name}`
                : 'Your Races'}
          </div>

          <div
            style={{
              marginTop: 8,
              color: '#475569',
              fontSize: 14,
              maxWidth: 700,
            }}
          >
            {activeEvent
              ? 'A race is currently live. Open Race Home to manage timing, devices, and live progress.'
              : reviewEvent
                ? 'A race is waiting for final review. Check results, fix issues, and finalize when ready.'
                : 'Create or open a race, set up timer devices, and follow the guided flow from Race Home.'}
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/create-race')}
          style={{
            border: 'none',
            borderRadius: 12,
            padding: '12px 16px',
            fontWeight: 700,
            cursor: 'pointer',
            color: '#fff',
            background: '#f97316',
            boxShadow: '0 6px 18px rgba(249,115,22,0.22)',
          }}
        >
          Create Race
        </button>
      </div>

      {activeEvent && (
        <div
          style={{
            border: '1px solid #bbf7d0',
            background: '#f0fdf4',
            borderRadius: 16,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: '#166534' }}>
            Current Race
          </div>
          <div style={{ marginTop: 6, color: '#166534' }}>
            {activeEvent.name} is live now.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => navigate(`/race/${activeEvent.id}/setup`)}
              style={{
                border: 'none',
                borderRadius: 10,
                padding: '10px 14px',
                fontWeight: 700,
                cursor: 'pointer',
                color: '#166534',
                background: '#dcfce7',
              }}
            >
              Open Race Home
            </button>

            <button
              type="button"
              onClick={() => navigate(`/race/${activeEvent.id}/monitor`)}
              style={{
                border: '1px solid #86efac',
                borderRadius: 10,
                padding: '10px 14px',
                fontWeight: 600,
                cursor: 'pointer',
                color: '#166534',
                background: '#fff',
              }}
            >
              Open Live View
            </button>
          </div>
        </div>
      )}

      {!activeEvent && reviewEvent && (
        <div
          style={{
            border: '1px solid #fde68a',
            background: '#fffbeb',
            borderRadius: 16,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: '#92400e' }}>
            Results Review
          </div>
          <div style={{ marginTop: 6, color: '#92400e' }}>
            {reviewEvent.name} is ready for result checking and finalization.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => navigate(`/race/${reviewEvent.id}/setup`)}
              style={{
                border: 'none',
                borderRadius: 10,
                padding: '10px 14px',
                fontWeight: 700,
                cursor: 'pointer',
                color: '#854d0e',
                background: '#fef3c7',
              }}
            >
              Open Review
            </button>

            <button
              type="button"
              onClick={() => navigate(`/results/${reviewEvent.id}`)}
              style={{
                border: '1px solid #fcd34d',
                borderRadius: 10,
                padding: '10px 14px',
                fontWeight: 600,
                cursor: 'pointer',
                color: '#854d0e',
                background: '#fff',
              }}
            >
              View Results
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#b91c1c',
            borderRadius: 12,
            padding: 14,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: 24,
            background: '#fff',
            color: '#64748b',
          }}
        >
          Loading races...
        </div>
      ) : sortedEvents.length === 0 ? (
        <div
          style={{
            border: '1px dashed #cbd5e1',
            borderRadius: 16,
            padding: 28,
            background: '#fff',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
            No races yet
          </div>
          <div style={{ marginTop: 8, color: '#64748b' }}>
            Create your first race to start setup, timing, and results tracking.
          </div>
          <button
            type="button"
            onClick={() => navigate('/create-race')}
            style={{
              marginTop: 16,
              border: 'none',
              borderRadius: 12,
              padding: '12px 16px',
              fontWeight: 700,
              cursor: 'pointer',
              color: '#fff',
              background: '#f97316',
            }}
          >
            Create First Race
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {sortedEvents.map(event => (
            <EventCard
              key={event.id}
              event={event}
              onOpen={openPath}
              onDelete={handleDelete}
              deletingId={deletingId}
            />
          ))}
        </div>
      )}
    </div>
  )
}