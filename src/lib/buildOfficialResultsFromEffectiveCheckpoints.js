import { supabase } from '../supabase'

function displayName(row) {
  const full = `${row.first_name || ''} ${row.last_name || ''}`.trim()
  if (full) return full
  if (row.team) return row.team
  if (row.bib_number) return `Bib ${row.bib_number}`
  return 'Unknown Entry'
}

export function buildOfficialResultsFromRows(rows) {
  const byEntry = new Map()

  for (const row of rows || []) {
    if (!byEntry.has(row.entry_id)) {
      byEntry.set(row.entry_id, {
        entry_id: row.entry_id,
        bib_number: row.bib_number ?? '',
        first_name: row.first_name ?? '',
        last_name: row.last_name ?? '',
        name: displayName(row),
        team: row.team ?? '',
        division: row.division ?? '',
        gender: row.gender ?? '',
        checkpoints: [],
      })
    }

    byEntry.get(row.entry_id).checkpoints.push(row)
  }

  const results = [...byEntry.values()]
    .map(entry => {
      const checkpoints = [...entry.checkpoints].sort(
        (a, b) => a.checkpoint_order - b.checkpoint_order
      )

      const finish = checkpoints.find(cp => cp.is_finish)
      const hasCheckpointAdjustment = checkpoints.some(cp => cp.adjustment_id != null)

      return {
        ...entry,
        checkpoints,
        raw_finish_time_ms: finish?.raw_elapsed_ms ?? null,
        finish_time_ms: finish?.effective_elapsed_ms ?? null,
        has_checkpoint_adjustment: hasCheckpointAdjustment,
        adjusted_checkpoint_count: checkpoints.filter(cp => cp.adjustment_id != null).length,
      }
    })
    .filter(entry => entry.finish_time_ms != null)
    .sort((a, b) => {
      if (a.finish_time_ms == null && b.finish_time_ms == null) return 0
      if (a.finish_time_ms == null) return 1
      if (b.finish_time_ms == null) return -1
      return a.finish_time_ms - b.finish_time_ms
    })
    .map((entry, idx) => ({
      ...entry,
      place: idx + 1,
    }))

  return results
}

export async function fetchOfficialResultsFromEffectiveCheckpoints(eventId) {
  const { data, error } = await supabase.rpc('get_event_effective_checkpoint_results', {
    p_event_id: eventId,
  })

  if (error) throw error

  return buildOfficialResultsFromRows(data || [])
}