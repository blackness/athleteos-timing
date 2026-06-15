export function getRaceElapsedMs(event, now = Date.now()) {
  if (!event?.race_started_at) return null

  const startMs = new Date(event.race_started_at).getTime()

  if (event?.status === 'finished' && event?.race_finished_at) {
    return Math.max(0, new Date(event.race_finished_at).getTime() - startMs)
  }

  return Math.max(0, now - startMs)
}

export function formatRaceClock(ms) {
  if (ms == null || ms < 0) return '0:00:00'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}