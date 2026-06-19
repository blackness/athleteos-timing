export function formatAdjustmentMs(ms) {
  const sign = ms < 0 ? '-' : '+'
  const abs = Math.abs(ms)
  const totalSeconds = Math.floor(abs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${sign}${minutes}:${String(seconds).padStart(2, '0')}`
}

export function sumAdjustments(adjustments = []) {
  return adjustments.reduce((sum, a) => sum + (Number(a.adjustment_ms) || 0), 0)
}

export function groupAdjustmentsByEntryOrBib(rows = []) {
  const map = new Map()

  for (const row of rows) {
    const keys = []

    if (row.entry_id) keys.push(row.entry_id)
    if (row.bib_number) keys.push(`bib:${row.bib_number}`)

    for (const key of keys) {
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(row)
    }
  }

  return map
}

export function getAdjustmentKey(row) {
  return row.entry_id || `bib:${row.bib_number || ''}`
}