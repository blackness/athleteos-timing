export function getLoginPath(next) {
  return next ? `/login?next=${encodeURIComponent(next)}` : '/login'
}

export function getResultsPath(raceId) {
  return `/results/${raceId}`
}

export function getLiveBoardPath(raceId) {
  return `/public/race/${raceId}/live-board`
}

export function getRaceSetupPath(raceId) {
  return `/race/${raceId}/setup`
}

export function getRaceMonitorPath(raceId) {
  return `/race/${raceId}/monitor`
}

export function getRaceCheckpointsPath(raceId) {
  return `/race/${raceId}/checkpoints`
}

export function getRaceCheckpointQrPath(raceId) {
  return `/race/${raceId}/checkpoint-qr`
}

export function getRaceTimingPath(raceId) {
  return `/race/${raceId}/time`
}

export function getRaceAssignPath(raceId) {
  return `/race/${raceId}/assign`
}

export function getRaceCorrectionsPath(raceId) {
  return `/race/${raceId}/corrections`
}

export function getRaceResultsCorrectionsPath(raceId) {
  return `/race/${raceId}/results/resultscorrectionspage`
}

export function getCreateRacePath({ parentEventId, copyRaceId } = {}) {
  const params = new URLSearchParams()

  if (parentEventId) params.set('parentEventId', parentEventId)
  if (copyRaceId) params.set('copyRaceId', copyRaceId)

  const query = params.toString()
  return query ? `/create-race?${query}` : '/create-race'
}

export function getCreateEventPath() {
  return '/create-event'
}

export function getEventHubPath(eventId) {
  return `/event/${eventId}`
}

export function getPublicHomePath() {
  return '/public'
}
export function getRaceDirectorPath(raceId) {
  return `/race/${raceId}/director`
}

export function getStaffAccessPath(accessCode) {
  return `/staff/${accessCode}`
}
