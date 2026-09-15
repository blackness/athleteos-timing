import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { getRaceElapsedMs, formatRaceClock } from '../lib/raceClock'
import { createXCRaces } from '../lib/createXCRaces'

function formatDate(str) {
  return new Date(str).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

const SPORT_OPTIONS = [
  'Running',
  'Cycling',
  'Swimming',
  'Triathlon',
  'Duathlon',
  'Cross Country',
  'Track & Field',
  'Other'
]

const DISTANCE_OPTIONS = [
  '400m',
  '800m',
  '1500m',
  '1 Mile',
  '3000m',
  '5K',
  '8K',
  '10K',
  '15K',
  'Half Marathon',
  'Marathon',
  '40K TT',
  'Sprint Tri',
  'Olympic Tri',
  '70.3',
  'Custom'
]

function getPrimaryAction(event) {
  if (event.status === 'active') {
    return {
      label: '▶ Resume Race',
      path: `/race/${event.id}/monitor`,
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
      label: 'View Race',
      path: `/race/${event.id}/monitor`,
      color: '#94a3b8',
      background: 'rgba(148,163,184,0.06)',
    }
  }

  return {
    label: '+ Setup',
    path: `/race/${event.id}/setup`,
    color: '#f97316',
    background: 'transparent',
  }
}

function getEventPriority(event) {
  if (event.status === 'active') return 0
  if (event.status === 'results_review') return 1
  if (event.status === 'draft' || event.status === 'ready') return 2
  if (event.status === 'finished') return 3
  return 4
}

export default function Events() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [deletingEventId, setDeletingEventId] = useState(null)

  const [form, setForm] = useState({
    name: '',
    sport: 'Running',
    distance: '5K',
    custom_distance: '',
    date: new Date().toISOString().split('T')[0],
    location: '',
    notes: ''
  })

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    loadEvents()
  }, [])

  async function loadEvents() {
    if (!user?.id) return

    setLoading(true)

    const { data } = await supabase
      .from('race_events')
      .select('*, race_finishes(count), race_started_at, race_finished_at')
      .eq('user_id', user.id)
      .order('event_date', { ascending: false })

    setEvents(data ?? [])
    setLoading(false)
  }

  async function createEvent() {
    if (!form.name.trim()) {
      setError('Event name is required')
      return
    }

    if (form.distance === 'Custom' && !form.custom_distance.trim()) {
      setError('Custom distance is required')
      return
    }

    setSaving(true)
    setError(null)

    const distance = form.distance === 'Custom' ? form.custom_distance.trim() : form.distance

    try {
      if (form.sport === 'Cross Country') {
        const races = await createXCRaces({
          meetName: form.name.trim(),
          eventDate: form.date,
          location: form.location.trim() || null,
          races: [
            { name: 'Novice Girls', distance: '4 km' },
            { name: 'Novice Boys', distance: '4 km' },
            { name: 'Junior Girls', distance: '5 km' },
            { name: 'Junior Boys', distance: '5 km' },
            { name: 'Senior Girls', distance: '6 km' },
            { name: 'Senior Boys', distance: '6 km' },
          ],
          userId: user.id,
          notes: form.notes.trim() || null,
          sport: form.sport,
        })

        setSaving(false)
        setShowModal(false)
        resetForm()
        await loadEvents()

        if (races?.length > 0) {
          navigate(`/race/${races[0].id}/setup`)
        }

        return
      }

      const { data, error: err } = await supabase
        .from('race_events')
        .insert({
          user_id: user.id,
          name: form.name.trim(),
          sport: form.sport,
          distance,
          event_date: form.date,
          location: form.location.trim() || null,
          notes: form.notes.trim() || null,
          status: 'draft',
          race_started_at: null,
          race_finished_at: null,
        })
        .select()
        .single()

      if (err) {
        throw err
      }

      const { error: checkpointError } = await supabase
        .from('race_checkpoints')
        .insert([
          {
            event_id: data.id,
            name: 'Start',
            checkpoint_order: 1,
            is_active: true,
          },
          {
            event_id: data.id,
            name: 'Finish',
            checkpoint_order: 2,
            is_active: true,
          },
        ])

      if (checkpointError) {
        throw new Error(`Event created, but default checkpoints failed: ${checkpointError.message}`)
      }

      setSaving(false)
      setShowModal(false)
      resetForm()
      await loadEvents()
      navigate(`/race/${data.id}/setup`)
    } catch (err) {
      console.error('Failed to create event', err)
      setSaving(false)
      setError(err.message || 'Failed to create event')
    }
  }

  function resetForm() {
    setForm({
      name: '',
      sport: 'Running',
      distance: '5K',
      custom_distance: '',
      date: new Date().toISOString().split('T')[0],
      location: '',
      notes: ''
    })
    setError(null)
  }

  async function deleteEvent(event) {
    const isLive = event.status === 'active'
    const isReview = event.status === 'results_review'
    const isFinished = event.status === 'finished'

    const warning = isLive
      ? `Delete "${event.name}"?\n\nThis race is currently active. This will permanently remove the event and its timing data.`
      : isReview
        ? `Delete "${event.name}"?\n\nThis race is in Results Review. This will permanently remove the event and all captured race data.`
        : isFinished
          ? `Delete "${event.name}"?\n\nThis race is finished. This will permanently remove the event and all saved results.`
          : `Delete "${event.name}"?\n\nThis will permanently remove the event and all related test/setup data.`

    const confirmed = window.confirm(warning)
    if (!confirmed) return

    try {
      setDeletingEventId(event.id)

      const childDeletes = [
        supabase.from('checkpoint_time_adjustments').delete().eq('event_id', event.id),
        supabase.from('race_result_adjustments').delete().eq('event_id', event.id),
        supabase.from('race_finishes').delete().eq('event_id', event.id),
        supabase.from('lap_events').delete().eq('event_id', event.id),
        supabase.from('race_waves').delete().eq('event_id', event.id),
        supabase.from('race_checkpoints').delete().eq('event_id', event.id),
        supabase.from('event_entries').delete().eq('event_id', event.id),
      ]

      for (const op of childDeletes) {
        const { error } = await op
        if (error) throw error
      }

      const { error: eventDeleteError } = await supabase
        .from('race_events')
        .delete()
        .eq('id', event.id)
        .eq('user_id', user.id)

      if (eventDeleteError) throw eventDeleteError

      await loadEvents()
    } catch (err) {
      console.error('Failed to delete event', err)
      window.alert(`Failed to delete event: ${err.message || 'Unknown error'}`)
    } finally {
      setDeletingEventId(null)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const priorityDiff = getEventPriority(a) - getEventPriority(b)
      if (priorityDiff !== 0) return priorityDiff

      const aDate = new Date(a.event_date || 0).getTime()
      const bDate = new Date(b.event_date || 0).getTime()
      return bDate - aDate
    })
  }, [events])

  const activeEvent = useMemo(() => {
    return events.find(e => e.status === 'active') || null
  }, [events])

  const reviewEvent = useMemo(() => {
    if (activeEvent) return null
    return events.find(e => e.status === 'results_review') || null
  }, [events, activeEvent])

  const headerEvent = activeEvent || reviewEvent
  const headerEventElapsed = headerEvent ? getRaceElapsedMs(headerEvent, now) : null

  return (
    <div style={{ minHeight: '100dvh', background: '#080b0f', fontFamily: "'Barlow', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:wght@300;400;500;600&display=swap" rel="stylesheet" />

      <div
        style={{
          padding: '20px 20px 16px',
          background: 'linear-gradient(180deg, #0d1117 0%, #080b0f 100%)',
          borderBottom: '1px solid #1e2730',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: '#4a5568',
              letterSpacing: 3,
              textTransform: 'uppercase',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700
            }}
          >
            AthleteOS
          </div>
          <h1
            style={{
              color: '#f0f4f8',
              fontSize: 26,
              fontWeight: 900,
              margin: '2px 0 0',
              fontFamily: "'Barlow Condensed', sans-serif",
              letterSpacing: -0.5
            }}
          >
            {activeEvent
              ? `Now Timing: ${activeEvent.name}`
              : reviewEvent
                ? `In Review: ${reviewEvent.name}`
                : 'Race Timing'}
          </h1>

          {headerEvent && (
            <div
              style={{
                marginTop: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 10,
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 800,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: activeEvent ? '#22c55e' : '#eab308',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: activeEvent ? '#22c55e' : '#eab308',
                    display: 'inline-block',
                    animation: activeEvent ? 'pulse 1.4s infinite' : 'none',
                  }}
                />
                {activeEvent ? 'Live' : 'Results Review'}
              </span>

              <span
                style={{
                  color: activeEvent ? '#f0f4f8' : '#94a3b8',
                  fontSize: 20,
                  fontWeight: 900,
                  fontFamily: "'Barlow Condensed', sans-serif",
                  letterSpacing: -0.5,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {headerEventElapsed != null ? formatRaceClock(headerEventElapsed) : '—'}
              </span>

              <span style={{ color: '#4a5568', fontSize: 12 }}>
                {headerEvent.distance ? `${headerEvent.distance}` : ''}
                {headerEvent.location ? ` · ${headerEvent.location}` : ''}
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#4a5568' }}>
            {profile?.full_name?.split(' ')[0]}
          </span>
          <button
            onClick={handleSignOut}
            style={{
              background: 'none',
              border: '1px solid #1e2730',
              borderRadius: 6,
              color: '#4a5568',
              fontSize: 12,
              fontWeight: 600,
              padding: '5px 12px',
              cursor: 'pointer',
              fontFamily: "'Barlow Condensed', sans-serif",
              letterSpacing: 1,
              textTransform: 'uppercase'
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {activeEvent && (
        <div style={{ padding: '16px 20px 0' }}>
          <div
            style={{
              background: '#0e1318',
              borderRadius: 16,
              border: '1.5px solid rgba(34,197,94,0.35)',
              padding: '16px 18px',
              boxShadow: '0 0 28px rgba(34,197,94,0.08)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: '#22c55e',
                letterSpacing: 2,
                textTransform: 'uppercase',
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 800,
                marginBottom: 6,
              }}
            >
              Active Race
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: '#f0f4f8',
                    fontSize: 22,
                    fontWeight: 900,
                    fontFamily: "'Barlow Condensed', sans-serif",
                    letterSpacing: 0.3,
                    lineHeight: 1.1
                  }}
                >
                  {activeEvent.name}
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ color: '#4a5568', fontSize: 12 }}>{activeEvent.sport}</span>
                  <span style={{ color: '#4a5568', fontSize: 12 }}>{activeEvent.distance}</span>
                  {activeEvent.location && <span style={{ color: '#4a5568', fontSize: 12 }}>📍 {activeEvent.location}</span>}
                </div>
              </div>

              <div style={{ textAlign: 'right', minWidth: 120 }}>
                <div
                  style={{
                    fontSize: 34,
                    fontWeight: 900,
                    color: '#22c55e',
                    fontVariantNumeric: 'tabular-nums',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    letterSpacing: -1.2,
                    lineHeight: 1
                  }}
                >
                  {formatRaceClock(getRaceElapsedMs(activeEvent, now))}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: '#4a5568',
                    textTransform: 'uppercase',
                    letterSpacing: 1.2,
                    marginTop: 2
                  }}
                >
                  live clock
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => navigate(`/race/${activeEvent.id}/monitor`)}
                  style={{
                    background: 'rgba(34,197,94,0.10)',
                    border: '1px solid rgba(34,197,94,0.25)',
                    borderRadius: 8,
                    color: '#22c55e',
                    fontSize: 12,
                    fontWeight: 800,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    letterSpacing: 1.2,
                    textTransform: 'uppercase'
                  }}
                >
                  Monitor
                </button>

                <button
                  onClick={() => navigate(`/race/${activeEvent.id}/checkpoints`)}
                  style={{
                    background: 'rgba(249,115,22,0.08)',
                    border: '1px solid #1e2730',
                    borderRadius: 8,
                    color: '#f97316',
                    fontSize: 12,
                    fontWeight: 800,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    letterSpacing: 1.2,
                    textTransform: 'uppercase'
                  }}
                >
                  Checkpoints
                </button>

                <button
                  onClick={() => navigate(`/results/${activeEvent.id}`)}
                  style={{
                    background: 'rgba(59,130,246,0.08)',
                    border: '1px solid #1e2730',
                    borderRadius: 8,
                    color: '#60a5fa',
                    fontSize: 12,
                    fontWeight: 800,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    letterSpacing: 1.2,
                    textTransform: 'uppercase'
                  }}
                >
                  Live Results
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!activeEvent && reviewEvent && (
        <div style={{ padding: '16px 20px 0' }}>
          <div
            style={{
              background: '#0e1318',
              borderRadius: 16,
              border: '1.5px solid rgba(234,179,8,0.30)',
              padding: '16px 18px',
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: '#eab308',
                letterSpacing: 2,
                textTransform: 'uppercase',
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 800,
                marginBottom: 6,
              }}
            >
              Results Review
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div
                  style={{
                    color: '#f0f4f8',
                    fontSize: 20,
                    fontWeight: 900,
                    fontFamily: "'Barlow Condensed', sans-serif",
                  }}
                >
                  {reviewEvent.name}
                </div>
                <div style={{ color: '#4a5568', fontSize: 12, marginTop: 4 }}>
                  This race has ended and is awaiting final review/finalization.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => navigate(`/race/${reviewEvent.id}/setup`)}
                  style={{
                    background: 'rgba(234,179,8,0.10)',
                    border: '1px solid rgba(234,179,8,0.25)',
                    borderRadius: 8,
                    color: '#eab308',
                    fontSize: 12,
                    fontWeight: 800,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    letterSpacing: 1.2,
                    textTransform: 'uppercase'
                  }}
                >
                  Review Race
                </button>

                <button
                  onClick={() => navigate(`/results/${reviewEvent.id}`)}
                  style={{
                    background: 'rgba(59,130,246,0.08)',
                    border: '1px solid #1e2730',
                    borderRadius: 8,
                    color: '#60a5fa',
                    fontSize: 12,
                    fontWeight: 800,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    letterSpacing: 1.2,
                    textTransform: 'uppercase'
                  }}
                >
                  Live Results
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 20px 0' }}>
        <button
          onClick={() => setShowModal(true)}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, #16a34a, #15803d)',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: 2,
            textTransform: 'uppercase',
            boxShadow: '0 4px 24px rgba(22,163,74,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10
          }}
        >
          <span style={{ fontSize: 20 }}>+</span> New Event
        </button>
      </div>

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ color: '#4a5568', textAlign: 'center', padding: '40px 0', fontSize: 14 }}>
            Loading...
          </div>
        ) : sortedEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏁</div>
            <p style={{ color: '#4a5568', fontSize: 15, marginBottom: 8 }}>No events yet</p>
            <p style={{ color: '#2d3748', fontSize: 13 }}>Create your first event to start timing</p>
          </div>
        ) : (
          sortedEvents.map(event => {
            const finisherCount = event.race_finishes?.[0]?.count ?? 0
            const isActive = event.status === 'active'
            const isReview = event.status === 'results_review'
            const isFinished = event.status === 'finished'
            const raceElapsed = getRaceElapsedMs(event, now)
            const primaryAction = getPrimaryAction(event)

            return (
              <div
                key={event.id}
                style={{
                  background: '#0e1318',
                  borderRadius: 14,
                  border: `1.5px solid ${
                    isActive
                      ? 'rgba(34,197,94,0.3)'
                      : isReview
                        ? 'rgba(234,179,8,0.25)'
                        : isFinished
                          ? 'rgba(148,163,184,0.18)'
                          : '#1e2730'
                  }`,
                  overflow: 'hidden',
                  boxShadow: isActive ? '0 0 20px rgba(34,197,94,0.08)' : 'none'
                }}
              >
                <div style={{ padding: '16px 16px 12px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      marginBottom: 8
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginBottom: 4,
                          flexWrap: 'wrap'
                        }}
                      >
                        {isActive && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: '#22c55e',
                                animation: 'pulse 1.5s infinite'
                              }}
                            />
                            <span
                              style={{
                                fontSize: 10,
                                fontFamily: "'Barlow Condensed', sans-serif",
                                fontWeight: 700,
                                color: '#22c55e',
                                letterSpacing: 2,
                                textTransform: 'uppercase'
                              }}
                            >
                              Live
                            </span>
                          </div>
                        )}

                        {isReview && (
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: "'Barlow Condensed', sans-serif",
                              fontWeight: 700,
                              color: '#eab308',
                              letterSpacing: 2,
                              textTransform: 'uppercase'
                            }}
                          >
                            Review
                          </span>
                        )}

                        {isFinished && (
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: "'Barlow Condensed', sans-serif",
                              fontWeight: 700,
                              color: '#94a3b8',
                              letterSpacing: 2,
                              textTransform: 'uppercase'
                            }}
                          >
                            Finished
                          </span>
                        )}

                        {!isActive && !isReview && !isFinished && (
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: "'Barlow Condensed', sans-serif",
                              fontWeight: 700,
                              color: '#f97316',
                              letterSpacing: 2,
                              textTransform: 'uppercase'
                            }}
                          >
                            Draft
                          </span>
                        )}

                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: "'Barlow Condensed', sans-serif",
                            fontWeight: 700,
                            letterSpacing: 2,
                            textTransform: 'uppercase',
                            color: '#4a5568'
                          }}
                        >
                          {event.sport} · {event.distance}
                        </span>
                      </div>

                      <div
                        style={{
                          color: '#f0f4f8',
                          fontSize: 18,
                          fontWeight: 700,
                          fontFamily: "'Barlow Condensed', sans-serif",
                          letterSpacing: 0.3,
                          lineHeight: 1.2
                        }}
                      >
                        {event.name}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          gap: 12,
                          marginTop: 6,
                          flexWrap: 'wrap',
                          alignItems: 'center'
                        }}
                      >
                        <span style={{ color: '#4a5568', fontSize: 12 }}>
                          {formatDate(event.event_date)}
                        </span>
                        {event.location && (
                          <span style={{ color: '#4a5568', fontSize: 12 }}>
                            📍 {event.location}
                          </span>
                        )}
                        <span style={{ color: '#4a5568', fontSize: 12 }}>
                          {finisherCount} finisher{finisherCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    {raceElapsed != null && (isActive || isReview || isFinished) && (
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                        <div
                          style={{
                            fontSize: 26,
                            fontWeight: 900,
                            color: isActive ? '#22c55e' : isReview ? '#eab308' : '#94a3b8',
                            fontVariantNumeric: 'tabular-nums',
                            fontFamily: "'Barlow Condensed', sans-serif",
                            letterSpacing: -1,
                            lineHeight: 1
                          }}
                        >
                          {formatRaceClock(raceElapsed)}
                        </div>
                        <div
                          style={{
                            fontSize: 9,
                            color: '#374151',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginTop: 2
                          }}
                        >
                          {isActive ? 'live' : isReview ? 'review' : 'final'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', borderTop: '1px solid #1e2730' }}>
                  <button
                    onClick={() => navigate(primaryAction.path)}
                    style={{
                      flex: 1,
                      padding: '12px 0',
                      background: primaryAction.background,
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 13,
                      fontWeight: 800,
                      letterSpacing: 1.5,
                      textTransform: 'uppercase',
                      color: primaryAction.color,
                      borderRight: '1px solid #1e2730'
                    }}
                  >
                    {primaryAction.label}
                  </button>

                  <button
                    onClick={() => navigate(`/race/${event.id}/checkpoints`)}
                    style={{
                      flex: 1,
                      padding: '12px 0',
                      background: 'rgba(249,115,22,0.06)',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 13,
                      fontWeight: 800,
                      letterSpacing: 1.5,
                      textTransform: 'uppercase',
                      color: '#f97316',
                      borderRight: '1px solid #1e2730'
                    }}
                  >
                    Checkpoints
                  </button>

                  <button
                    onClick={() => navigate(`/race/${event.id}/monitor`)}
                    style={{
                      flex: 1,
                      padding: '12px 0',
                      background: 'rgba(59,130,246,0.06)',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 13,
                      fontWeight: 800,
                      letterSpacing: 1.5,
                      textTransform: 'uppercase',
                      color: '#3b82f6',
                      borderRight: '1px solid #1e2730'
                    }}
                  >
                    Monitor
                  </button>

                  <button
                    onClick={() => navigate(`/results/${event.id}`)}
                    style={{
                      flex: 1,
                      padding: '12px 0',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      color: '#4a5568',
                      borderRight: '1px solid #1e2730'
                    }}
                  >
                    Results
                  </button>

                  <button
                    onClick={() => deleteEvent(event)}
                    disabled={deletingEventId === event.id}
                    style={{
                      flex: 1,
                      padding: '12px 0',
                      background: 'rgba(239,68,68,0.06)',
                      border: 'none',
                      cursor: deletingEventId === event.id ? 'not-allowed' : 'pointer',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 13,
                      fontWeight: 800,
                      letterSpacing: 1.5,
                      textTransform: 'uppercase',
                      color: deletingEventId === event.id ? '#7f1d1d' : '#ef4444',
                      opacity: deletingEventId === event.id ? 0.7 : 1
                    }}
                  >
                    {deletingEventId === event.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {showModal && (
        <div
          onClick={e => {
            if (e.target === e.currentTarget) {
              setShowModal(false)
              resetForm()
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: '0'
          }}
        >
          <div
            style={{
              background: '#0e1318',
              borderRadius: '20px 20px 0 0',
              border: '1px solid #1e2730',
              borderBottom: 'none',
              width: '100%',
              maxWidth: 560,
              padding: '24px 24px 40px',
              maxHeight: '90dvh',
              overflowY: 'auto'
            }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#1e2730', margin: '0 auto 20px' }} />

            <div
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 22,
                fontWeight: 900,
                color: '#f0f4f8',
                marginBottom: 20,
                letterSpacing: 0.5
              }}
            >
              New Event
            </div>

            {error && (
              <div
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#f87171',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 13,
                  marginBottom: 16
                }}
              >
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: '#4a5568', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>
                  Event Name *
                </label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={form.sport === 'Cross Country' ? 'KSS XC Meet' : 'Tuesday Night 5K'}
                  style={{ width: '100%', padding: '11px 14px', background: '#080b0f', border: '1.5px solid #1e2730', borderRadius: 8, color: '#f0f4f8', fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: "'Barlow', sans-serif" }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#4a5568', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>Sport</label>
                  <select
                    value={form.sport}
                    onChange={e => setForm(f => ({ ...f, sport: e.target.value }))}
                    style={{ width: '100%', padding: '11px 14px', background: '#080b0f', border: '1.5px solid #1e2730', borderRadius: 8, color: '#f0f4f8', fontSize: 14, outline: 'none', fontFamily: "'Barlow', sans-serif" }}
                  >
                    {SPORT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#4a5568', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>Distance</label>
                  <select
                    value={form.distance}
                    onChange={e => setForm(f => ({ ...f, distance: e.target.value }))}
                    style={{ width: '100%', padding: '11px 14px', background: '#080b0f', border: '1.5px solid #1e2730', borderRadius: 8, color: '#f0f4f8', fontSize: 14, outline: 'none', fontFamily: "'Barlow', sans-serif" }}
                  >
                    {DISTANCE_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              {form.distance === 'Custom' && (
                <div>
                  <label style={{ fontSize: 11, color: '#4a5568', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>Custom Distance</label>
                  <input
                    value={form.custom_distance}
                    onChange={e => setForm(f => ({ ...f, custom_distance: e.target.value }))}
                    placeholder="e.g. 12K, 25 Mile TT"
                    style={{ width: '100%', padding: '11px 14px', background: '#080b0f', border: '1.5px solid #1e2730', borderRadius: 8, color: '#f0f4f8', fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: "'Barlow', sans-serif" }}
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#4a5568', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    style={{ width: '100%', padding: '11px 14px', background: '#080b0f', border: '1.5px solid #1e2730', borderRadius: 8, color: '#f0f4f8', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: "'Barlow', sans-serif", colorScheme: 'dark' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#4a5568', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>Location</label>
                  <input
                    value={form.location}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="Riverside Park"
                    style={{ width: '100%', padding: '11px 14px', background: '#080b0f', border: '1.5px solid #1e2730', borderRadius: 8, color: '#f0f4f8', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: "'Barlow', sans-serif" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: '#4a5568', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Wave times, categories, special instructions..."
                  rows={2}
                  style={{ width: '100%', padding: '11px 14px', background: '#080b0f', border: '1.5px solid #1e2730', borderRadius: 8, color: '#f0f4f8', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: "'Barlow', sans-serif", resize: 'vertical' }}
                />
              </div>

              <button
                onClick={createEvent}
                disabled={saving}
                style={{
                  width: '100%',
                  padding: '15px',
                  borderRadius: 10,
                  background: saving ? '#1e2730' : 'linear-gradient(135deg, #16a34a, #15803d)',
                  border: 'none',
                  color: '#fff',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 16,
                  fontWeight: 900,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  boxShadow: saving ? 'none' : '0 4px 20px rgba(22,163,74,0.3)',
                  marginTop: 4
                }}
              >
                {saving
                  ? 'Creating...'
                  : form.sport === 'Cross Country'
                    ? 'Create XC Meet Races →'
                    : 'Create & Setup Race →'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        input::placeholder { color: #2d3748; }
        input:focus, textarea:focus, select:focus { border-color: #f97316 !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e2730; border-radius: 2px; }
      `}</style>
    </div>
  )
}