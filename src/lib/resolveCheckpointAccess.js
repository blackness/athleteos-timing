import { getStaffSession } from './staffAccess'

export async function resolveCheckpointAccess({ eventId, checkpointId, accessCode }) {
  if (eventId && checkpointId) {
    return {
      eventId,
      checkpointId,
      source: 'direct',
    }
  }

  if (!accessCode) {
    throw new Error('Missing checkpoint route params')
  }

  const session = getStaffSession(accessCode)

  if (!session) {
    throw new Error('Staff session not found')
  }

  if (!session.raceEventId) {
    throw new Error('Staff session missing race event id')
  }

  if (!session.checkpointId) {
    throw new Error('Staff session missing checkpoint id')
  }

  return {
    eventId: session.raceEventId,
    checkpointId: session.checkpointId,
    role: session.role || null,
    source: 'staff_session',
  }
}