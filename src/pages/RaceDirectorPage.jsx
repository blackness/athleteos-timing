import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getRaceElapsedMs, formatRaceClock } from '../lib/raceClock'
import { useTheme } from '../contexts/ThemeContext'
import {
  getResultsPath,
  getLiveBoardPath,
  getRaceSetupPath,
  getRaceMonitorPath,
  getRaceCheckpointsPath,
  getRaceAssignPath,
  getRaceCorrectionsPath,
  getRaceCheckpointQrPath,
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

function StatCard({ label, value, tone, styles }) {
  return (
    <div style={styles.stat}>
      <div style={{ ...styles.statVal, color: tone }}>{value}</div>
      <div style={styles.statLbl}>{label}</div>
    </div>
  )
}

function RoleCard({ title, text, onClick, tone, styles }) {
  return (
    <button type="button" onClick={onClick} style={styles.roleCard}>
      <div style={{ ...styles.roleTitle, color: tone }}>{title}</div>
      <div style={styles.roleText}>{text}</div>
    </button>
  )
}

function ToolCard({ title, text, onClick, styles }) {
  return (
    <button type="button" onClick={onClick} style={styles.toolCard}>
      <div style={styles.toolTitle}>{title}</div>
      <div style={styles.toolText}>{text}</div>
    </button>
  )
}

function NextActionPanel({
  race,
  pendingCount,
  onOpenSetup,
  onStartRace,
  onOpenMonitor,
  onOpenAssign,
  onOpenTimer,
  onOpenCorrections,
  onOpenResults,
  onFinalizeRace,
  onOpenLiveBoard,
  onOpenEventHub,
  startingRace,
  finalizingRace,
  canShowEventHub,
  styles,
}) {
  const status = race?.status || 'draft'

  if (status === 'active') {
    return (
      <div style={styles.nextActionCard}>
        <div style={styles.nextActionEyebrow}>Next Action</div>
        <div style={styles.nextActionTitle}>The race is live</div>
        <div style={styles.nextActionText}>
          Monitor race flow and resolve finish-line issues as they happen.
          {pendingCount > 0
            ? ` There ${pendingCount === 1 ? 'is' : 'are'} currently ${pendingCount} pending assignment${pendingCount === 1 ? '' : 's'}.`
            : ' No pending finish assignments are currently waiting.'}
        </div>

        <div style={styles.primaryActionRow}>
          <button type="button" onClick={onOpenMonitor} style={styles.primaryActionBtn}>
            Open Monitor
          </button>
          <button type="button" onClick={onOpenAssign} style={styles.secondaryActionBtn}>
            Assign Bibs
          </button>
          <button type="button" onClick={onOpenTimer} style={styles.secondaryActionBtn}>
            Timer Devices
          </button>
        </div>
      </div>
    )
  }

  if (status === 'results_review') {
    return (
      <div style={styles.nextActionCard}>
        <div style={styles.nextActionEyebrow}>Next Action</div>
        <div style={styles.nextActionTitle}>Review and finalize results</div>
        <div style={styles.nextActionText}>
          The race has ended. Review pending items, fix any issues, then finalize results when everything looks correct.
        </div>

        <div style={styles.primaryActionRow}>
          <button type="button" onClick={onOpenCorrections} style={styles.primaryActionBtn}>
            Review & Fix Results
          </button>
          <button type="button" onClick={onOpenResults} style={styles.secondaryActionBtn}>
            Open Results
          </button>
          <button
            type="button"
            onClick={onFinalizeRace}
            disabled={finalizingRace}
            style={{
              ...styles.secondaryActionBtn,
              opacity: finalizingRace ? 0.75 : 1,
              cursor: finalizingRace ? 'not-allowed' : 'pointer',
            }}
          >
            {finalizingRace ? 'Finalizing…' : 'Finalize Results'}
          </button>
        </div>
      </div>
    )
  }

  if (status === 'finished') {
    return (
      <div style={styles.nextActionCard}>
        <div style={styles.nextActionEyebrow}>Next Action</div>
        <div style={styles.nextActionTitle}>Results are final</div>
        <div style={styles.nextActionText}>
          This race is complete. Review final standings, share public outputs, or move back to the event.
        </div>

        <div style={styles.primaryActionRow}>
          <button type="button" onClick={onOpenResults} style={styles.primaryActionBtn}>
            Open Results
          </button>
          <button type="button" onClick={onOpenLiveBoard} style={styles.secondaryActionBtn}>
            Live Board
          </button>
          {canShowEventHub ? (
            <button type="button" onClick={onOpenEventHub} style={styles.secondaryActionBtn}>
              Event Hub
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  if (status === 'ready') {
    return (
      <div style={styles.nextActionCard}>
        <div style={styles.nextActionEyebrow}>Next Action</div>
        <div style={styles.nextActionTitle}>Race is ready to start</div>
        <div style={styles.nextActionText}>
          Staff should be in position. Confirm timer devices are ready, then start the race when athletes are set.
        </div>

        <div style={styles.primaryActionRow}>
          <button
            type="button"
            onClick={onStartRace}
            disabled={startingRace}
            style={{
              ...styles.primaryActionBtn,
              opacity: startingRace ? 0.75 : 1,
              cursor: startingRace ? 'not-allowed' : 'pointer',
            }}
          >
            {startingRace ? 'Starting…' : 'Start Race'}
          </button>
          <button type="button" onClick={onOpenMonitor} style={styles.secondaryActionBtn}>
            Open Monitor
          </button>
          <button type="button" onClick={onOpenTimer} style={styles.secondaryActionBtn}>
            Timer Devices
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.nextActionCard}>
      <div style={styles.nextActionEyebrow}>Next Action</div>
      <div style={styles.nextActionTitle}>Review setup before race day</div>
      <div style={styles.nextActionText}>
        This race is not live yet. Confirm roster, checkpoints, waves, and public sharing before starting.
      </div>

      <div style={styles.primaryActionRow}>
        <button type="button" onClick={onOpenSetup} style={styles.primaryActionBtn}>
          Review Setup
        </button>
        <button
          type="button"
          onClick={onStartRace}
          disabled={startingRace}
          style={{
            ...styles.secondaryActionBtn,
            opacity: startingRace ? 0.75 : 1,
            cursor: startingRace ? 'not-allowed' : 'pointer',
          }}
        >
          {startingRace ? 'Starting…' : 'Start Race'}
        </button>
        <button type="button" onClick={onOpenTimer} style={styles.secondaryActionBtn}>
          Timer Devices
        </button>
      </div>
    </div>
  )
}

export default function RaceDirectorPage() {
  const { id: raceId } = useParams()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const S = useMemo(() => getStyles(theme), [theme])

  const [race, setRace] = useState(null)
  const [parentEvent, setParentEvent] = useState(null)
  const [finishCount, setFinishCount] = useState(0)
  const [officialFinishCount, setOfficialFinishCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [startingRace, setStartingRace] = useState(false)
  const [finalizingRace, setFinalizingRace] = useState(false)
  const [resettingRaceData, setResettingRaceData] = useState(false)
  const [deletingRace, setDeletingRace] = useState(false)
  const [destructivePin, setDestructivePin] = useState('')

  const [now, setNow] = useState(Date.now())

  const RESET_PIN = '2468'

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
    if (race?.status === 'ready') {
      return {
        text: 'READY',
        color: '#22c55e',
        bg: 'rgba(34,197,94,0.10)',
        border: 'rgba(34,197,94,0.25)',
      }
    }
    return {
      text: 'DRAFT',
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.10)',
      border: 'rgba(59,130,246,0.25)',
    }
  }, [race?.status])

  const startRace = async () => {
    if (!race?.id || startingRace) return

    const ok = window.confirm(
      'Start race now?\n\nThis will activate checkpoint timers and begin the public live clock.'
    )
    if (!ok) return

    setStartingRace(true)
    const startedAt = new Date().toISOString()

    const { data, error } = await supabase
      .from('race_events')
      .update({
        race_started_at: startedAt,
        race_finished_at: null,
        status: 'active',
      })
      .eq('id', race.id)
      .select()
      .single()

    setStartingRace(false)

    if (error || !data) {
      window.alert(`Could not start race: ${error?.message || 'Unknown error'}`)
      return
    }

    setRace(data)
    await loadData()
  }

  const finalizeRace = async () => {
    if (!race?.id || finalizingRace || race?.status !== 'results_review') return

    const ok = window.confirm(
      'Finalize results now?\n\nThis marks the race as complete/final.'
    )
    if (!ok) return

    setFinalizingRace(true)

    const { data, error } = await supabase
      .from('race_events')
      .update({ status: 'finished' })
      .eq('id', race.id)
      .select()
      .single()

    setFinalizingRace(false)

    if (error || !data) {
      window.alert(`Could not finalize race: ${error?.message || 'Unknown error'}`)
      return
    }

    setRace(data)
    await loadData()
  }

  const falseStartRace = async () => {
    if (!race?.id || resettingRaceData || race?.status !== 'active') {
      window.alert('False Start is only available while the race is active.')
      return
    }

    const ok = window.confirm(
      'Declare a false start?\n\nThis will delete captured splits/finishes, clear wave actual start times, and return the race to draft.'
    )
    if (!ok) return

    try {
      setResettingRaceData(true)

      const { error: lapError } = await supabase
        .from('lap_events')
        .delete()
        .eq('event_id', race.id)
      if (lapError) throw lapError

      const { error: finishError } = await supabase
        .from('race_finishes')
        .delete()
        .eq('event_id', race.id)
      if (finishError) throw finishError

      const { error: waveError } = await supabase
        .from('race_waves')
        .update({ actual_start_time: null })
        .eq('event_id', race.id)
      if (waveError) throw waveError

      const { data: updatedRace, error: raceError } = await supabase
        .from('race_events')
        .update({
          race_started_at: null,
          race_finished_at: null,
          status: 'draft',
        })
        .eq('id', race.id)
        .select()
        .single()
      if (raceError) throw raceError

      setRace(updatedRace)
      await loadData()
      window.alert('False start recorded. Race has been reset to draft.')
    } catch (err) {
      window.alert(`False start failed: ${err.message || 'Unknown error'}`)
    } finally {
      setResettingRaceData(false)
    }
  }

  const resetRaceData = async () => {
    if (!race?.id || resettingRaceData) return

    if (destructivePin !== RESET_PIN) {
      window.alert('Incorrect PIN.')
      return
    }

    const ok = window.confirm(
      'Reset all race timing data?\n\nThis will delete captured splits/finishes, clear wave actual start times, and reset the race to draft.'
    )
    if (!ok) return

    try {
      setResettingRaceData(true)

      const { error: lapError } = await supabase
        .from('lap_events')
        .delete()
        .eq('event_id', race.id)
      if (lapError) throw lapError

      const { error: finishError } = await supabase
        .from('race_finishes')
        .delete()
        .eq('event_id', race.id)
      if (finishError) throw finishError

      const { error: waveError } = await supabase
        .from('race_waves')
        .update({ actual_start_time: null })
        .eq('event_id', race.id)
      if (waveError) throw waveError

      const { data: updatedRace, error: raceError } = await supabase
        .from('race_events')
        .update({
          race_started_at: null,
          race_finished_at: null,
          status: 'draft',
        })
        .eq('id', race.id)
        .select()
        .single()
      if (raceError) throw raceError

      setRace(updatedRace)
      setDestructivePin('')
      await loadData()
      window.alert('Race timing data reset successfully.')
    } catch (err) {
      window.alert(`Reset failed: ${err.message || 'Unknown error'}`)
    } finally {
      setResettingRaceData(false)
    }
  }

  const deleteRace = async () => {
    if (!race?.id || deletingRace) return

    if (destructivePin !== RESET_PIN) {
      window.alert('Incorrect PIN.')
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
        <button type="button" style={S.backBtn} onClick={() => navigate('/')}>
          ← Dashboard
        </button>

        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={S.headerEyebrow}>Race Director</div>
          <div style={S.headerTitle}>{race?.name || 'Race'}</div>
          {parentEvent?.name ? (
            <div style={S.headerSub}>Part of {parentEvent.name}</div>
          ) : null}
        </div>

        <div style={S.headerTools}>
          <button
            type="button"
            style={S.headerToolBtn}
            onClick={() => navigate(getRaceSetupPath(raceId))}
          >
            Setup
          </button>

          {parentEvent?.id ? (
            <button
              type="button"
              style={S.headerToolBtn}
              onClick={() => navigate(getEventHubPath(parentEvent.id))}
            >
              Event Hub
            </button>
          ) : null}
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

              <div style={{ marginTop: 14, color: theme.textMuted, fontSize: 13 }}>
                Start: {formatDateTime(race?.race_started_at)}
              </div>
              <div style={{ marginTop: 4, color: theme.textMuted, fontSize: 13 }}>
                Finish: {formatDateTime(race?.race_finished_at)}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={S.clockLabel}>
                {race?.status === 'active'
                  ? 'Race Clock'
                  : race?.status === 'results_review'
                    ? 'Results Review'
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
              tone={pendingCount > 0 ? '#f59e0b' : theme.text}
              styles={S}
            />
            <StatCard label="Finish Records" value={finishCount} tone={theme.text} styles={S} />
            <StatCard label="Official Finishes" value={officialFinishCount} tone={theme.text} styles={S} />
            <StatCard label="Race Status" value={race?.status || 'draft'} tone={theme.text} styles={S} />
          </div>
        </div>

        <NextActionPanel
          race={race}
          pendingCount={pendingCount}
          startingRace={startingRace}
          finalizingRace={finalizingRace}
          canShowEventHub={!!parentEvent?.id}
          onOpenSetup={() => navigate(getRaceSetupPath(raceId))}
          onStartRace={startRace}
          onOpenMonitor={() => navigate(getRaceMonitorPath(raceId))}
          onOpenAssign={() => navigate(getRaceAssignPath(raceId))}
          onOpenTimer={() => navigate(getRaceCheckpointsPath(raceId))}
          onOpenCorrections={() => navigate(getRaceCorrectionsPath(raceId))}
          onOpenResults={() => navigate(getResultsPath(raceId))}
          onFinalizeRace={finalizeRace}
          onOpenLiveBoard={() => navigate(getLiveBoardPath(raceId))}
          onOpenEventHub={() => parentEvent?.id && navigate(getEventHubPath(parentEvent.id))}
          styles={S}
        />

        <div style={S.section}>
          <div style={S.sectionTitle}>Race-Day Roles</div>
          <div style={S.sectionSub}>
            Send staff to the right operational screen for their job.
          </div>

          <div style={S.roleGrid}>
            <RoleCard
              title="Timer"
              text="Open timing and checkpoint workflows for device operators."
              onClick={() => navigate(getRaceCheckpointsPath(raceId))}
              tone="#f97316"
              styles={S}
            />
            <RoleCard
              title="Assigner"
              text="Resolve pending finish identities and assign bibs."
              onClick={() => navigate(getRaceAssignPath(raceId))}
              tone="#22c55e"
              styles={S}
            />
            <RoleCard
              title="Monitor"
              text="Watch race progress, counts, and live flow."
              onClick={() => navigate(getRaceMonitorPath(raceId))}
              tone="#60a5fa"
              styles={S}
            />
          </div>
        </div>

        <div style={S.section}>
          <div style={S.sectionTitle}>Supporting Tools</div>
          <div style={S.toolGrid}>
            <ToolCard
              title="Setup"
              text="Roster, checkpoints, waves, public sharing, and configuration."
              onClick={() => navigate(getRaceSetupPath(raceId))}
              styles={S}
            />
            <ToolCard
              title="Results"
              text="Open public results for verification."
              onClick={() => navigate(getResultsPath(raceId))}
              styles={S}
            />
            <ToolCard
              title="Live Board"
              text="Open the public live board."
              onClick={() => navigate(getLiveBoardPath(raceId))}
              styles={S}
            />
            <ToolCard
              title="Print Device QR Codes"
              text="Open checkpoint/device QR tools."
              onClick={() => navigate(getRaceCheckpointQrPath(raceId))}
              styles={S}
            />
            {parentEvent?.id ? (
              <ToolCard
                title="Event Hub"
                text="Open the public event overview page."
                onClick={() => navigate(getEventHubPath(parentEvent.id))}
                styles={S}
              />
            ) : null}
          </div>
        </div>

        <div style={S.section}>
          <div style={S.sectionTitle}>Danger Zone</div>

          <div style={S.dangerStack}>
            <div style={S.dangerCard}>
              <div style={S.dangerEyebrow}>Race Reset</div>
              <div style={S.dangerTitle}>False Start</div>
              <div style={S.dangerText}>
                Use this only if the race was started in error and timing should be cleared.
              </div>
              <button
                type="button"
                onClick={falseStartRace}
                disabled={resettingRaceData || race?.status !== 'active'}
                style={{
                  ...S.dangerSecondaryBtn,
                  opacity: resettingRaceData || race?.status !== 'active' ? 0.65 : 1,
                  cursor:
                    resettingRaceData || race?.status !== 'active'
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {resettingRaceData ? 'Resetting…' : 'False Start'}
              </button>
            </div>

            <div style={S.dangerCard}>
              <div style={S.dangerEyebrow}>Timing Reset</div>
              <div style={S.dangerTitle}>Reset Race Data</div>
              <div style={S.dangerText}>
                Delete captured timing records and reset the race back to draft while keeping core configuration.
              </div>

              <div style={{ minWidth: 220, maxWidth: 320, marginBottom: 12 }}>
                <div style={S.dangerLabel}>Enter Race PIN</div>
                <input
                  type="password"
                  value={destructivePin}
                  onChange={e => setDestructivePin(e.target.value)}
                  placeholder="Enter PIN"
                  style={S.dangerInput}
                />
              </div>

              <button
                type="button"
                onClick={resetRaceData}
                disabled={resettingRaceData}
                style={{
                  ...S.dangerSecondaryBtn,
                  opacity: resettingRaceData ? 0.65 : 1,
                  cursor: resettingRaceData ? 'not-allowed' : 'pointer',
                }}
              >
                {resettingRaceData ? 'Resetting…' : 'Reset Race Data'}
              </button>
            </div>

            <div style={S.dangerCard}>
              <div style={S.dangerEyebrow}>Permanent Delete</div>
              <div style={S.dangerTitle}>Delete Race</div>
              <div style={S.dangerText}>
                Permanently delete the race plus related entries, waves, checkpoints, laps, finishes, and adjustments.
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
                <div style={{ minWidth: 220, flex: 1 }}>
                  <div style={S.dangerLabel}>Enter Race PIN</div>
                  <input
                    type="password"
                    value={destructivePin}
                    onChange={e => setDestructivePin(e.target.value)}
                    placeholder="Enter PIN"
                    style={S.dangerInput}
                  />
                </div>

                <button
                  type="button"
                  onClick={deleteRace}
                  disabled={deletingRace}
                  style={{
                    ...S.dangerPrimaryBtn,
                    opacity: deletingRace ? 0.7 : 1,
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
    </div>
  )
}

function getStyles(theme) {
  return {
    page: {
      minHeight: '100dvh',
      background: theme.cardBg,
      color: theme.text,
      fontFamily: FB,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexWrap: 'wrap',
      padding: '14px 20px',
      borderBottom: `1px solid ${theme.border}`,
      background: theme.cardBg,
    },
    body: {
      maxWidth: 1200,
      margin: '0 auto',
      padding: '24px 20px 60px',
    },
    backBtn: {
      background: 'none',
      border: `1px solid ${theme.borderSoft}`,
      color: theme.textMuted,
      borderRadius: 8,
      padding: '8px 14px',
      cursor: 'pointer',
      fontSize: 12,
      fontFamily: F,
      fontWeight: 700,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    headerTools: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
    },
    headerToolBtn: {
      background: 'transparent',
      border: `1px solid ${theme.borderSoft}`,
      color: theme.textMuted,
      borderRadius: 8,
      padding: '8px 12px',
      cursor: 'pointer',
      fontSize: 12,
      fontFamily: F,
      fontWeight: 700,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    headerEyebrow: {
      fontSize: 11,
      color: theme.secondaryText,
      letterSpacing: 2,
      fontFamily: F,
      fontWeight: 800,
      textTransform: 'uppercase',
    },
    headerTitle: {
      fontSize: 18,
      color: theme.text,
      fontFamily: F,
      fontWeight: 800,
      marginTop: 2,
    },
    headerSub: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2,
    },
    heroCard: {
      background: theme.cardBg,
      border: `1px solid ${theme.border}`,
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
      color: theme.textMuted,
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
      color: theme.text,
      fontFamily: F,
    },
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      gap: 12,
    },
    stat: {
      background: theme.cardAltBg,
      border: `1px solid ${theme.borderSoft}`,
      borderRadius: 12,
      padding: '14px 16px',
    },
    statVal: {
      fontSize: 28,
      fontWeight: 900,
      lineHeight: 1,
      fontFamily: F,
      textTransform: 'uppercase',
    },
    statLbl: {
      fontSize: 10,
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1.4,
      marginTop: 6,
      fontFamily: F,
      fontWeight: 700,
    },
    nextActionCard: {
      background: `linear-gradient(135deg, ${theme.primary}18, ${theme.secondaryText}14)`,
      border: `1px solid ${theme.border}`,
      borderRadius: 18,
      padding: 22,
      marginBottom: 28,
    },
    nextActionEyebrow: {
      fontSize: 11,
      color: theme.secondaryText,
      textTransform: 'uppercase',
      letterSpacing: 2,
      marginBottom: 8,
      fontFamily: F,
      fontWeight: 800,
    },
    nextActionTitle: {
      fontSize: 28,
      color: theme.text,
      fontFamily: F,
      fontWeight: 900,
      marginBottom: 10,
      lineHeight: 1,
    },
    nextActionText: {
      fontSize: 14,
      color: theme.textSoft || theme.textMuted,
      lineHeight: 1.7,
      maxWidth: 860,
      marginBottom: 16,
    },
    primaryActionRow: {
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap',
    },
    primaryActionBtn: {
      border: 'none',
      borderRadius: 12,
      padding: '14px 18px',
      background: theme.primary,
      color: theme.primaryText,
      fontWeight: 800,
      cursor: 'pointer',
      fontFamily: FB,
    },
    secondaryActionBtn: {
      border: `1px solid ${theme.borderSoft}`,
      borderRadius: 12,
      padding: '14px 18px',
      background: theme.cardAltBg,
      color: theme.text,
      border: `1px solid ${theme.borderSoft}`,
      fontWeight: 700,
      cursor: 'pointer',
      fontFamily: FB,
    },
    section: {
      marginBottom: 28,
    },
    sectionTitle: {
      fontSize: 24,
      fontWeight: 800,
      marginBottom: 8,
      fontFamily: F,
      color: theme.text,
    },
    sectionSub: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 1.6,
      marginBottom: 14,
    },
    roleGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: 12,
    },
    roleCard: {
      textAlign: 'left',
      background: theme.cardBg,
      border: `1px solid ${theme.border}`,
      borderRadius: 14,
      padding: 16,
      cursor: 'pointer',
      color: theme.text,
    },
    roleTitle: {
      fontSize: 16,
      fontWeight: 900,
      marginBottom: 8,
      fontFamily: F,
    },
    roleText: {
      fontSize: 13,
      color: theme.textMuted,
      lineHeight: 1.5,
    },
    toolGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: 12,
    },
    toolCard: {
      textAlign: 'left',
      background: theme.cardBg,
      border: `1px solid ${theme.border}`,
      borderRadius: 14,
      padding: 16,
      cursor: 'pointer',
      color: theme.text,
    },
    toolTitle: {
      fontSize: 15,
      fontWeight: 800,
      marginBottom: 8,
      fontFamily: F,
      color: theme.text,
    },
    toolText: {
      fontSize: 13,
      color: theme.textMuted,
      lineHeight: 1.5,
    },
    dangerStack: {
      display: 'grid',
      gap: 14,
    },
    dangerCard: {
      background: theme.dangerBg,
      border: `1px solid ${theme.dangerBorder}`,
      borderRadius: 16,
      padding: 18,
    },
    dangerEyebrow: {
      fontSize: 11,
      color: theme.dangerText,
      textTransform: 'uppercase',
      letterSpacing: 2,
      marginBottom: 8,
      fontFamily: F,
      fontWeight: 800,
    },
    dangerTitle: {
      fontSize: 16,
      fontWeight: 800,
      color: theme.dangerText,
      marginBottom: 8,
      fontFamily: F,
    },
    dangerText: {
      fontSize: 13,
      color: theme.dangerText,
      lineHeight: 1.6,
      marginBottom: 14,
      opacity: 0.92,
    },
    dangerLabel: {
      fontSize: 10,
      color: theme.dangerText,
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
      border: `1px solid ${theme.dangerBorder}`,
      background: theme.cardBg,
      color: theme.text,
      outline: 'none',
    },
    dangerPrimaryBtn: {
      border: 'none',
      borderRadius: 10,
      padding: '12px 16px',
      background: '#dc2626',
      color: '#fff',
      fontWeight: 800,
      cursor: 'pointer',
    },
    dangerSecondaryBtn: {
      border: `1px solid ${theme.dangerBorder}`,
      borderRadius: 10,
      padding: '12px 16px',
      background: 'transparent',
      color: theme.dangerText,
      fontWeight: 800,
      cursor: 'pointer',
    },
    centerCard: {
      maxWidth: 720,
      margin: '80px auto',
      background: theme.cardBg,
      border: `1px solid ${theme.border}`,
      borderRadius: 16,
      padding: 24,
      color: theme.textMuted,
    },
    centerCardError: {
      maxWidth: 720,
      margin: '80px auto',
      background: theme.dangerBg,
      border: `1px solid ${theme.dangerBorder}`,
      borderRadius: 16,
      padding: 24,
      color: theme.dangerText,
    },
  }
}