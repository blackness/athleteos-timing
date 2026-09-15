export function getRaceEventLocalKey(eventId) {
  return `race_event_pending:${eventId}`
}

export function loadRaceEventLocal(eventId) {
  try {
    const raw = localStorage.getItem(getRaceEventLocalKey(eventId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveRaceEventLocal(eventId, data) {
  localStorage.setItem(getRaceEventLocalKey(eventId), JSON.stringify(data))
}

export function clearRaceEventLocal(eventId) {
  localStorage.removeItem(getRaceEventLocalKey(eventId))
}

export function mergeEventWithLocal(eventData, localPending) {
  if (!localPending) return eventData
  return {
    ...eventData,
    status: localPending.status ?? eventData?.status,
    race_started_at: localPending.race_started_at ?? eventData?.race_started_at,
    race_finished_at: localPending.race_finished_at ?? eventData?.race_finished_at,
  }
}