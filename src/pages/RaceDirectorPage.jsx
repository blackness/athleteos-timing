import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getRaceElapsedMs, formatRaceClock } from '../lib/raceClock'
import {
  getResultsPath,
  getLiveBoardPath,
  getRaceSetupPath,
  getRaceMonitorPath,
  getRaceCheckpointsPath,
  getRaceAssignPath,
  getRaceCorrectionsPath,
  getEventHubPath,
} from '../lib/routes'

const F = "'Barlow Condensed', sans-serif"
const FB = "'Barlow', sans-serif"

function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

function StatCard({ label, value, tone = '#f1f5f9' }) {
  return (
    <div style={S.stat}>
      <div style={{ ...S.statVal, color: tone }}>{value}</div>
      <div style={S.statLbl}>{label}</div>
    </div>
  )
}

export default function RaceDirectorPage() {
  const { id: raceId } = useParams()
  const navigate = useNavigate()

  const [race, setRace] = useState(null)
  const [parentEvent, setParentEvent] = useState(null)
  const [finishCount, setFinishCount] = useState(0)
  const [officialFinishCount, setOfficialFinishCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingRace, setDeletingRace] = useState(false)

  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (race?.status !== 'active' || !race?.race_started_at) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [race?.status, race?.race_started_at])

  const loadData = useCallback(async () => {
    if (!raceId) return

    setLoading(true)
    setError('')

    const [
      raceRes,
      finishRes,
      pendingRes,
    ] = await Promise.all([
      supabase
        .from('race_events')
        .select('*')
        .eq('id', raceId)
        .single(),
      supabase
        .from('race_finishes')
        .select('id, status', { count: 'exact' })
        .eq('event_id', raceId),
      supabase
        .from('lap_events')
        .select('id', { count: 'exact' })
        .eq('event_id', raceId)
        .eq('status', 'pending'),
    ])

    if (raceRes.error) {
      setError(raceRes.error.message || 'Could not load race.')
      setLoading(false)
      return
    }

    const raceData = raceRes.data || null
    setRace(raceData)

    const allFinishes = finishRes.data || []
    setFinishCount(finishRes.count || allFinishes.length || 0)
    setOfficialFinishCount(allFinishes.filter(f => f.status !== 'pending').length)
    setPendingCount(pendingRes.count || 0)

    if (raceData?.parent_event_id) {
      const { data: parentData } = await supabase
        .from('events')
        .select('*')
        .eq('id', raceData.parent_event_id)
        .single()

      setParentEvent(parentData || null)
    } else {
      setParentEvent(null)
    }

    setLoading(false)
  }, [raceId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const elapsedMs = useMemo(() => getRaceElapsedMs(race, now), [race, now])

  const statusBadge = useMemo(() => {
    if (race?.status === 'active') {
      return {
        text: 'LIVE',
        color: '#ef4444',
        bg: 'rgba(239,68,68,0.10)',
        border: 'rgba(239,68,68,0.25)',
      }
    }
    if (race?.status === 'results_review') {
      return {
        text: 'RESULTS REVIEW',
        color: '#eab308',
        bg: 'rgba(234,179,8,0.10)',
        border: 'rgba(234,179,8,0.25)',
      }
    }
    if (race?.status === 'finished') {
      return {
        text: 'FINAL',
        color: '#10b981',
        bg: 'rgba(16,185,129,0.10)',
        border: 'rgba(16,185,129,0.25)',
      }
    }
    return {
      text: 'READY',
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.10)',
      border: 'rgba(59,130,246,0.25)',
    }
  }, [race?.status])

  const deleteRace = async () => {
    if (!race?.id || deletingRace) return

    if (deleteConfirmText !== 'DELETE') {
      window.alert('Type DELETE to confirm.')
      return
    }

    const ok = window.confirm(
      `Delete race "${race.name}"?\n\nThis will permanently delete the race and its related timing/config data. This cannot be undone.`
    )
    if (!ok) return

    setDeletingRace(true)

    try {
      await supabase.from('lap_events').delete().eq('event_id', race.id)
      await supabase.from('race_finishes').delete().eq('event_id', race.id)
      await supabase.from('checkpoint_time_adjustments').delete().eq('event_id', race.id)
      await supabase.from('race_result_adjustments').delete().eq('event_id', race.id)
      await supabase.from('event_entries').delete().eq('event_id', race.id)
      await supabase.from('race_waves').delete().eq('event_id', race.id)
      await supabase.from('race_checkpoints').delete().eq('event_id', race.id)

      const { error } = await supabase
        .from('race_events')
        .delete()
        .eq('id', race.id)

      if (error) throw error

      navigate('/', { replace: true })
    } catch (err) {
      window.alert(`Could not delete race: ${err.message || 'Unknown error'}`)
      setDeletingRace(false)
    }
  }

  if (loading) {
    return (
      <div style={S.page}>
        <div style={S.centerCard}>Loading director page…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={S.page}>
        <div style={S.centerCardError}>{error}</div>
      </div>
    )
  }

  return (
    <div style={S.page}>
      <link
        href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      <div style={S.header}>
        <button
          type="button"
          style={S.backBtn}
          onClick={() => navigate(getRaceSetupPath(raceId))}
        >
          ← Race Home
        </button>

        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={S.headerEyebrow}>Race Director</div>
          <div style={S.headerTitle}>{race?.name || 'Race'}</div>
          {parentEvent?.name ? (
            <div style={S.headerSub}>Part of {parentEvent.name}</div>
          ) : null}
        </div>

        <div style={S.buttonRow}>
          {parentEvent?.id ? (
            <button
              type="button"
              style={{ ...S.backBtn, color: '#34d399' }}
              onClick={() => navigate(getEventHubPath(parentEvent.id))}
            >
              Event Hub ↗
            </button>
          ) : null}

          <button
            type="button"
            style={{ ...S.backBtn, color: '#60a5fa' }}
            onClick={() => navigate(getResultsPath(raceId))}
          >
            Results ↗
          </button>

          <button
            type="button"
            style={{ ...S.backBtn, color: '#a78bfa' }}
            onClick={() => navigate(getLiveBoardPath(raceId))}
          >
            Live Board ↗
          </button>
        </div>
      </div>

      <div style={S.body}>
        <div style={S.heroCard}>
          <div style={S.heroTop}>
            <div>
              <div
                style={{
                  ...S.badge,
                  background: statusBadge.bg,
                  border: `1px solid ${statusBadge.border}`,
                  color: statusBadge.color,
                }}
              >
                {statusBadge.text}
              </div>

              <div style={{ marginTop: 14, color: '#94a3b8', fontSize: 13 }}>
                Start: {formatDateTime(race?.race_started_at)}
              </div>
              <div style={{ marginTop: 4, color: '#94a3b8', fontSize: 13 }}>
                Finish: {formatDateTime(race?.race_finished_at)}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={S.clockLabel}>
                {race?.status === 'active'
                  ? 'Race Clock'
                  : race?.status === 'results_review'
                    ? 'Review Clock'
                    : race?.status === 'finished'
                      ? 'Final Time'
                      : 'Waiting'}
              </div>
              <div style={S.clockValue}>{formatRaceClock(elapsedMs)}</div>
            </div>
          </div>

          <div style={S.statsGrid}>
            <StatCard
              label="Pending Assignments"
              value={pendingCount}
              tone={pendingCount > 0 ? '#f59e0b' : '#f1f5f9'}
            />
            <StatCard label="Finish Records" value={finishCount} />
            <StatCard label="Official Finishes" value={officialFinishCount} />
            <StatCard label="Race Status" value={race?.status || 'draft'} />
          </div>
        </div>

        <div style={S.section}>
          <div style={S.sectionTitle}>Quick Actions</div>

          <div style={S.quickGrid}>
            <button
              type="button"
              onClick={() => navigate(getRaceSetupPath(raceId))}
              style={S.quickCard}
            >
              <div style={S.quickTitle}>Race Home</div>
              <div style={S.quickText}>
                Pre-race setup, roster, checkpoints, and public sharing.
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate(getRaceCheckpointsPath(raceId))}
              style={S.quickCard}
            >
              <div style={S.quickTitle}>Timer Devices</div>
              <div style={S.quickText}>
                Open timing and checkpoint device workflows.
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate(getRaceAssignPath(raceId))}
              style={S.quickCard}
            >
              <div style={S.quickTitle}>Assign Bibs</div>
              <div style={S.quickText}>
                Resolve pending finish identities.
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate(getRaceMonitorPath(raceId))}
              style={S.quickCard}
            >
              <div style={S.quickTitle}>Monitor</div>
              <div style={S.quickText}>
                Watch live race flow and counts.
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate(getResultsPath(raceId))}
              style={S.quickCard}
            >
              <div style={S.quickTitle}>Results</div>
              <div style={S.quickText}>
                Open public results for verification.
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate(getRaceCorrectionsPath(raceId))}
              style={S.quickCard}
            >
              <div style={S.quickTitle}>Review & Fix</div>
              <div style={S.quickText}>
                Corrections and result cleanup.
              </div>
            </button>
          </div>
        </div>

        <div style={S.section}>
          <div style={S.sectionTitle}>Danger Zone</div>

          <div
            style={{
              background: 'rgba(127,29,29,0.10)',
              border: '1px solid rgba(239,68,68,0.35)',
              borderRadius: 16,
              padding: 18,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: '#f87171',
                textTransform: 'uppercase',
                letterSpacing: 2,
                marginBottom: 8,
                fontFamily: F,
                fontWeight: 800,
              }}
            >
              Delete Race
            </div>

            <div
              style={{
                fontSize: 15,
                color: '#fecaca',
                marginBottom: 8,
                fontWeight: 800,
              }}
            >
              Permanently delete this race
            </div>

            <div
              style={{
                fontSize: 13,
                color: '#fca5a5',
                lineHeight: 1.6,
                marginBottom: 14,
              }}
            >
              This deletes the race record and related entries, waves, checkpoints,
              lap events, finishes, and adjustments. This action cannot be undone.
            </div>

            <div
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                alignItems: 'end',
              }}
            >
              <div style={{ minWidth: 220, flex: 1 }}>
                <div style={S.dangerLabel}>Type DELETE to confirm</div>
                <input
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  style={S.dangerInput}
                />
              </div>

              <button
                type="button"
                onClick={deleteRace}
                disabled={deletingRace}
                style={{
                  ...S.dangerButton,
                  opacity: deletingRace ? 0.75 : 1,
                  cursor: deletingRace ? 'not-allowed' : 'pointer',
                }}
              >
                {deletingRace ? 'Deleting…' : 'Delete Race'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const S = {
  page: {
    minHeight: '100dvh',
    background: '#080b0f',
    color: '#e2e8f0',
    fontFamily: FB,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    padding: '14px 20px',
    borderBottom: '1px solid #1a2030',
    background: '#0c1018',
  },
  body: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '24px 20px 60px',
  },
  backBtn: {
    background: 'none',
    border: '1px solid #1e2730',
    color: '#4a5568',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: F,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerEyebrow: {
    fontSize: 11,
    color: '#f97316',
    letterSpacing: 2,
    fontFamily: F,
    fontWeight: 800,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 18,
    color: '#f1f5f9',
    fontFamily: F,
    fontWeight: 800,
    marginTop: 2,
  },
  headerSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  heroCard: {
    background: '#0e1318',
    border: '1px solid #1a2030',
    borderRadius: 16,
    padding: 20,
    marginBottom: 22,
  },
  heroTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    padding: '6px 12px',
    fontSize: 11,
    fontFamily: F,
    fontWeight: 800,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  clockLabel: {
    fontSize: 10,
    color: '#4a5568',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    fontFamily: F,
    fontWeight: 700,
    marginBottom: 4,
  },
  clockValue: {
    fontSize: 42,
    lineHeight: 1,
    fontWeight: 900,
    letterSpacing: -1.5,
    color: '#f1f5f9',
    fontFamily: F,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 12,
  },
  stat: {
    background: '#080b0f',
    border: '1px solid #1e2730',
    borderRadius: 12,
    padding: '14px 16px',
  },
  statVal: {
    fontSize: 28,
    fontWeight: 900,
    lineHeight: 1,
    fontFamily: F,
  },
  statLbl: {
    fontSize: 10,
    color: '#4a5568',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginTop: 6,
    fontFamily: F,
    fontWeight: 700,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 800,
    marginBottom: 8,
    fontFamily: F,
    color: '#f1f5f9',
  },
  quickGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 12,
  },
  quickCard: {
    textAlign: 'left',
    background: '#0e1318',
    border: '1px solid #1a2030',
    borderRadius: 14,
    padding: 16,
    cursor: 'pointer',
    color: '#e2e8f0',
  },
  quickTitle: {
    fontSize: 16,
    fontWeight: 800,
    marginBottom: 8,
    fontFamily: F,
    color: '#f8fafc',
  },
  quickText: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 1.5,
  },
  buttonRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  dangerLabel: {
    fontSize: 10,
    color: '#fca5a5',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: 6,
    fontFamily: F,
    fontWeight: 700,
  },
  dangerInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(248,113,113,0.35)',
    background: '#120b0b',
    color: '#fff',
    outline: 'none',
  },
  dangerButton: {
    border: 'none',
    borderRadius: 10,
    padding: '12px 16px',
    background: '#dc2626',
    color: '#fff',
    fontWeight: 800,
  },
  centerCard: {
    maxWidth: 720,
    margin: '80px auto',
    background: '#0e1318',
    border: '1px solid #1a2030',
    borderRadius: 16,
    padding: 24,
    color: '#94a3b8',
  },
  centerCardError: {
    maxWidth: 720,
    margin: '80px auto',
    background: '#2a0f13',
    border: '1px solid #7f1d1d',
    borderRadius: 16,
    padding: 24,
    color: '#fca5a5',
  },
}