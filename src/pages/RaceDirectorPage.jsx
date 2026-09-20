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
  getStaffAccessPath,
} from '../lib/routes'

const F = "'Barlow Condensed', sans-serif"
const FB = "'Barlow', sans-serif"

function randomAccessCode(role) {
  const prefix =
    role === 'timer' ? 'TMR' :
    role === 'assigner' ? 'ASN' :
    'MON'

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let tail = ''
  for (let i = 0; i < 6; i++) {
    tail += chars[Math.floor(Math.random() * chars.length)]
  }
  return `${prefix}${tail}`
}

function randomPin() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

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

function StaffAccessCard({
  role,
  title,
  description,
  row,
  creating,
  updating,
  onCreate,
  onToggle,
  onRegeneratePin,
  onCopyLink,
  onCopyPin,
}) {
  const isActive = !!row?.is_active
  const shareUrl = row?.access_code ? `${window.location.origin}${getStaffAccessPath(row.access_code)}` : ''

  return (
    <div style={S.staffCard}>
      <div style={S.staffCardTop}>
        <div>
          <div style={S.staffRoleTitle}>{title}</div>
          <div style={S.staffRoleDescription}>{description}</div>
        </div>

        {!row ? (
          <button
            type="button"
            onClick={() => onCreate(role)}
            disabled={creating}
            style={{
              ...S.primaryBtn,
              opacity: creating ? 0.7 : 1,
              cursor: creating ? 'not-allowed' : 'pointer',
            }}
          >
            {creating ? 'Creating…' : 'Create Access'}
          </button>
        ) : (
          <span
            style={{
              ...S.badge,
              background: isActive ? 'rgba(16,185,129,0.10)' : 'rgba(107,114,128,0.12)',
              border: isActive ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(107,114,128,0.25)',
              color: isActive ? '#10b981' : '#9ca3af',
            }}
          >
            {isActive ? 'Active' : 'Inactive'}
          </span>
        )}
      </div>

      {row ? (
        <>
          <div style={S.staffInfoGrid}>
            <div style={S.staffInfoBox}>
              <div style={S.infoLabel}>Access Code</div>
              <div style={S.codeText}>{row.access_code}</div>
            </div>

            <div style={S.staffInfoBox}>
              <div style={S.infoLabel}>PIN</div>
              <div style={S.codeText}>{row.pin_code}</div>
            </div>
          </div>

          <div style={S.staffInfoBox}>
            <div style={S.infoLabel}>Share Link</div>
            <div style={S.urlText}>{shareUrl}</div>
          </div>

          <div style={S.staffMetaRow}>
            <span>Created: {formatDateTime(row.created_at)}</span>
            <span>Last used: {formatDateTime(row.last_used_at)}</span>
            <span>Expires: {row.expires_at ? formatDateTime(row.expires_at) : 'No expiry'}</span>
          </div>

          <div style={S.buttonRow}>
            <button
              type="button"
              onClick={() => onCopyLink(shareUrl)}
              style={S.secondaryBtn}
            >
              Copy Link
            </button>

            <button
              type="button"
              onClick={() => onCopyPin(row.pin_code)}
              style={S.secondaryBtn}
            >
              Copy PIN
            </button>

            <button
              type="button"
              onClick={() => onRegeneratePin(row)}
              disabled={updating}
              style={S.secondaryBtn}
            >
              {updating ? 'Updating…' : 'Regenerate PIN'}
            </button>

            <button
              type="button"
              onClick={() => onToggle(row)}
              disabled={updating}
              style={{
                ...S.secondaryBtn,
                color: row.is_active ? '#fca5a5' : '#86efac',
              }}
            >
              {updating ? 'Saving…' : row.is_active ? 'Disable Access' : 'Enable Access'}
            </button>
          </div>
        </>
      ) : (
        <div style={S.emptyText}>
          No staff access created yet for this role.
        </div>
      )}
    </div>
  )
}

export default function RaceDirectorPage() {
  const { id: raceId } = useParams()
  const navigate = useNavigate()

  const [race, setRace] = useState(null)
  const [parentEvent, setParentEvent] = useState(null)
  const [staffRows, setStaffRows] = useState([])
  const [finishCount, setFinishCount] = useState(0)
  const [officialFinishCount, setOfficialFinishCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creatingRole, setCreatingRole] = useState('')
  const [updatingRole, setUpdatingRole] = useState('')
  const [copied, setCopied] = useState('')

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
      staffRes,
      finishRes,
      pendingRes,
    ] = await Promise.all([
      supabase
        .from('race_events')
        .select('*')
        .eq('id', raceId)
        .single(),
      supabase
        .from('race_staff_access')
        .select('*')
        .eq('race_event_id', raceId)
        .order('created_at', { ascending: true }),
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
    setStaffRows(staffRes.data || [])

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

  const byRole = useMemo(() => {
    const map = {
      timer: null,
      assigner: null,
      monitor: null,
    }

    for (const row of staffRows || []) {
      if (!map[row.role]) {
        map[row.role] = row
      }
    }

    return map
  }, [staffRows])

  const elapsedMs = useMemo(() => getRaceElapsedMs(race, now), [race, now])

  const createAccess = async role => {
    if (!race?.id || creatingRole) return

    if (byRole[role]) {
      window.alert(`A ${role} access record already exists.`)
      return
    }

    setCreatingRole(role)

    const payload = {
      race_event_id: race.id,
      role,
      access_code: randomAccessCode(role),
      pin_code: randomPin(),
      label:
        role === 'timer'
          ? 'Timer Access'
          : role === 'assigner'
            ? 'Assigner Access'
            : 'Monitor Access',
      is_active: true,
    }

    const { error } = await supabase
      .from('race_staff_access')
      .insert(payload)

    setCreatingRole('')

    if (error) {
      window.alert(`Could not create ${role} access: ${error.message}`)
      return
    }

    await loadData()
  }

  const toggleAccess = async row => {
    if (!row?.id || updatingRole) return

    setUpdatingRole(row.role)

    const { error } = await supabase
      .from('race_staff_access')
      .update({
        is_active: !row.is_active,
      })
      .eq('id', row.id)

    setUpdatingRole('')

    if (error) {
      window.alert(`Could not update ${row.role} access: ${error.message}`)
      return
    }

    await loadData()
  }

  const regeneratePin = async row => {
    if (!row?.id || updatingRole) return

    const ok = window.confirm(`Regenerate PIN for ${row.role} access?`)
    if (!ok) return

    setUpdatingRole(row.role)

    const { error } = await supabase
      .from('race_staff_access')
      .update({
        pin_code: randomPin(),
      })
      .eq('id', row.id)

    setUpdatingRole('')

    if (error) {
      window.alert(`Could not regenerate PIN: ${error.message}`)
      return
    }

    await loadData()
  }

  const copyText = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(''), 1200)
    } catch {
      window.alert('Could not copy.')
    }
  }

  const statusBadge = useMemo(() => {
    if (race?.status === 'active') return { text: 'LIVE', color: '#ef4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.25)' }
    if (race?.status === 'results_review') return { text: 'RESULTS REVIEW', color: '#eab308', bg: 'rgba(234,179,8,0.10)', border: 'rgba(234,179,8,0.25)' }
    if (race?.status === 'finished') return { text: 'FINAL', color: '#10b981', bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)' }
    return { text: 'READY', color: '#3b82f6', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.25)' }
  }, [race?.status])

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
        <button type="button" style={S.backBtn} onClick={() => navigate(getRaceSetupPath(raceId))}>
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
            <StatCard label="Pending Assignments" value={pendingCount} tone={pendingCount > 0 ? '#f59e0b' : '#f1f5f9'} />
            <StatCard label="Finish Records" value={finishCount} />
            <StatCard label="Official Finishes" value={officialFinishCount} />
            <StatCard label="Staff Links" value={staffRows.length} />
          </div>
        </div>

        {copied ? (
          <div style={S.copyBanner}>
            {copied === 'timer-link' && 'Timer link copied'}
            {copied === 'timer-pin' && 'Timer PIN copied'}
            {copied === 'assigner-link' && 'Assigner link copied'}
            {copied === 'assigner-pin' && 'Assigner PIN copied'}
            {copied === 'monitor-link' && 'Monitor link copied'}
            {copied === 'monitor-pin' && 'Monitor PIN copied'}
          </div>
        ) : null}

        <div style={S.section}>
          <div style={S.sectionTitle}>Quick Actions</div>

          <div style={S.quickGrid}>
            <button
              type="button"
              onClick={() => navigate(getRaceSetupPath(raceId))}
              style={S.quickCard}
            >
              <div style={S.quickTitle}>Race Home</div>
              <div style={S.quickText}>Pre-race setup, roster, checkpoints, and public sharing.</div>
            </button>

            <button
              type="button"
              onClick={() => navigate(getRaceCheckpointsPath(raceId))}
              style={S.quickCard}
            >
              <div style={S.quickTitle}>Timer Devices</div>
              <div style={S.quickText}>Open staff device/timing setup flow.</div>
            </button>

            <button
              type="button"
              onClick={() => navigate(getRaceAssignPath(raceId))}
              style={S.quickCard}
            >
              <div style={S.quickTitle}>Assign Bibs</div>
              <div style={S.quickText}>Resolve pending finish identities.</div>
            </button>

            <button
              type="button"
              onClick={() => navigate(getRaceMonitorPath(raceId))}
              style={S.quickCard}
            >
              <div style={S.quickTitle}>Monitor</div>
              <div style={S.quickText}>Watch live race flow and counts.</div>
            </button>

            <button
              type="button"
              onClick={() => navigate(getResultsPath(raceId))}
              style={S.quickCard}
            >
              <div style={S.quickTitle}>Results</div>
              <div style={S.quickText}>Open public results for verification.</div>
            </button>

            <button
              type="button"
              onClick={() => navigate(getRaceCorrectionsPath(raceId))}
              style={S.quickCard}
            >
              <div style={S.quickTitle}>Review & Fix</div>
              <div style={S.quickText}>Corrections and result cleanup.</div>
            </button>
          </div>
        </div>

        <div style={S.section}>
          <div style={S.sectionTitle}>Staff Access</div>
          <div style={S.sectionSub}>
            Create role-limited links for race-day staff. Share the link or print it as a QR later, and give the 4-digit PIN separately.
          </div>

          <div style={S.staffGrid}>
            <StaffAccessCard
              role="timer"
              title="Timer Access"
              description="Use for timing staff operating device flows."
              row={byRole.timer}
              creating={creatingRole === 'timer'}
              updating={updatingRole === 'timer'}
              onCreate={createAccess}
              onToggle={toggleAccess}
              onRegeneratePin={regeneratePin}
              onCopyLink={url => copyText(url, 'timer-link')}
              onCopyPin={pin => copyText(pin, 'timer-pin')}
            />

            <StaffAccessCard
              role="assigner"
              title="Assigner Access"
              description="Use for finish-line staff resolving bib identities."
              row={byRole.assigner}
              creating={creatingRole === 'assigner'}
              updating={updatingRole === 'assigner'}
              onCreate={createAccess}
              onToggle={toggleAccess}
              onRegeneratePin={regeneratePin}
              onCopyLink={url => copyText(url, 'assigner-link')}
              onCopyPin={pin => copyText(pin, 'assigner-pin')}
            />

            <StaffAccessCard
              role="monitor"
              title="Monitor Access"
              description="Use for read-only race oversight and monitoring."
              row={byRole.monitor}
              creating={creatingRole === 'monitor'}
              updating={updatingRole === 'monitor'}
              onCreate={createAccess}
              onToggle={toggleAccess}
              onRegeneratePin={regeneratePin}
              onCopyLink={url => copyText(url, 'monitor-link')}
              onCopyPin={pin => copyText(pin, 'monitor-pin')}
            />
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
  copyBanner: {
    marginBottom: 18,
    background: 'rgba(16,185,129,0.10)',
    border: '1px solid rgba(16,185,129,0.25)',
    color: '#86efac',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
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
  sectionSub: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 1.6,
    marginBottom: 14,
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
  staffGrid: {
    display: 'grid',
    gap: 14,
  },
  staffCard: {
    background: '#0e1318',
    border: '1px solid #1a2030',
    borderRadius: 16,
    padding: 18,
  },
  staffCardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  staffRoleTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: '#f8fafc',
    fontFamily: F,
    marginBottom: 4,
  },
  staffRoleDescription: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 1.5,
  },
  staffInfoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    marginBottom: 12,
  },
  staffInfoBox: {
    background: '#080b0f',
    border: '1px solid #1e2730',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 10,
    color: '#4a5568',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: 6,
    fontFamily: F,
    fontWeight: 700,
  },
  codeText: {
    fontSize: 22,
    fontWeight: 900,
    color: '#f8fafc',
    letterSpacing: 1.5,
    fontFamily: F,
  },
  urlText: {
    fontSize: 12,
    color: '#cbd5e1',
    wordBreak: 'break-all',
    lineHeight: 1.5,
  },
  staffMetaRow: {
    display: 'flex',
    gap: 14,
    flexWrap: 'wrap',
    color: '#64748b',
    fontSize: 12,
    marginBottom: 14,
  },
  buttonRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  primaryBtn: {
    border: 'none',
    borderRadius: 10,
    padding: '12px 16px',
    background: '#f97316',
    color: '#fff',
    fontWeight: 800,
    cursor: 'pointer',
  },
  secondaryBtn: {
    border: '1px solid #1e2730',
    borderRadius: 10,
    padding: '10px 14px',
    background: '#0b1220',
    color: '#60a5fa',
    fontWeight: 700,
    cursor: 'pointer',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
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