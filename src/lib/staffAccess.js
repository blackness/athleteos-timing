const STORAGE_KEY = 'staff_access_session_v1'
const SESSION_HOURS = 12

export function getStoredStaffSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveStoredStaffSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export function createStaffSession({ accessCode, role, raceEventId, raceName }) {
  const sessions = getStoredStaffSessions()
  const grantedAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString()

  sessions[accessCode] = {
    accessCode,
    role,
    raceEventId,
    raceName: raceName || '',
    grantedAt,
    expiresAt,
  }

  saveStoredStaffSessions(sessions)
  return sessions[accessCode]
}

export function getStaffSession(accessCode) {
  const sessions = getStoredStaffSessions()
  const session = sessions[accessCode]

  if (!session) return null

  if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
    delete sessions[accessCode]
    saveStoredStaffSessions(sessions)
    return null
  }

  return session
}

export function clearStaffSession(accessCode) {
  const sessions = getStoredStaffSessions()
  delete sessions[accessCode]
  saveStoredStaffSessions(sessions)
}

export function clearAllStaffSessions() {
  localStorage.removeItem(STORAGE_KEY)
}

export function getStaffRolePath(accessCode, role) {
  if (role === 'timer') return `/staff/${accessCode}/timer`
  if (role === 'assigner') return `/staff/${accessCode}/assigner`
  return `/staff/${accessCode}/monitor`
}