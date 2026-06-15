import { supabase } from './supabase'

function fmtTime(ms) {
  if (ms == null) return ''
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const cs = Math.floor((ms % 1000) / 10)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function csvEscape(value) {
  if (value == null) return ''
  const s = String(value)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function downloadCSV(filename, rows) {
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.setAttribute('download', filename)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function exportRawLapEvents(eventId) {
  const [
    { data: eventData },
    { data: checkpoints },
    { data: entries },
    { data: lapEvents },
  ] = await Promise.all([
    supabase.from('race_events').select('*').eq('id', eventId).single(),
    supabase.from('race_checkpoints').select('*').eq('event_id', eventId).order('checkpoint_order', { ascending: true }),
    supabase.from('event_entries').select('*').eq('event_id', eventId),
    supabase.from('lap_events').select('*').eq('event_id', eventId).order('captured_at', { ascending: true }),
  ])

  const checkpointMap = {}
  ;(checkpoints || []).forEach(c => { checkpointMap[c.id] = c })

  const entryMap = {}
  ;(entries || []).forEach(e => { entryMap[e.bib_number] = e })

  const rows = [
    [
      'event_name',
      'bib_number',
      'name',
      'team',
      'division',
      'gender',
      'checkpoint_order',
      'checkpoint_name',
      'elapsed_ms',
      'elapsed_display',
      'captured_at',
      'assigned_at',
      'status',
      'device_id',
      'source',
      'is_corrected',
      'correction_note',
    ]
  ]

  ;(lapEvents || []).forEach(l => {
    const cp = checkpointMap[l.checkpoint_id]
    const entry = l.bib_number ? entryMap[l.bib_number] : null
    const name = entry ? `${entry.first_name}${entry.last_name ? ' ' + entry.last_name : ''}` : ''

    rows.push([
      eventData?.name ?? '',
      l.bib_number ?? '',
      name,
      entry?.team ?? '',
      entry?.division ?? '',
      entry?.gender ?? '',
      cp?.checkpoint_order ?? '',
      cp?.name ?? '',
      l.elapsed_ms ?? '',
      fmtTime(l.elapsed_ms),
      l.captured_at ?? '',
      l.assigned_at ?? '',
      l.status ?? '',
      l.device_id ?? '',
      l.source ?? '',
      l.is_corrected ? 'TRUE' : 'FALSE',
      l.correction_note ?? '',
    ])
  })

  downloadCSV(`race_${eventId}_raw_lap_events.csv`, rows)
}

export async function exportLapSummary(eventId) {
  const [
    { data: eventData },
    { data: checkpoints },
    { data: entries },
    { data: lapEvents },
  ] = await Promise.all([
    supabase.from('race_events').select('*').eq('id', eventId).single(),
    supabase.from('race_checkpoints').select('*').eq('event_id', eventId).order('checkpoint_order', { ascending: true }),
    supabase.from('event_entries').select('*').eq('event_id', eventId).order('bib_number', { ascending: true }),
    supabase.from('lap_events').select('*').eq('event_id', eventId).eq('status', 'assigned'),
  ])

  const cpList = checkpoints || []
  const cpMap = {}
  cpList.forEach(c => { cpMap[c.id] = c })

  const grouped = {}
  ;(lapEvents || []).forEach(l => {
    if (!l.bib_number) return
    if (!grouped[l.bib_number]) grouped[l.bib_number] = {}
    grouped[l.bib_number][l.checkpoint_id] = l
  })

  const header = ['event_name', 'bib_number', 'first_name', 'last_name', 'team', 'division', 'gender']
  cpList.forEach(cp => {
    header.push(`cp${cp.checkpoint_order}_name`)
    header.push(`cp${cp.checkpoint_order}_elapsed`)
  })

  const rows = [header]

  ;(entries || []).forEach(entry => {
    const row = [
      eventData?.name ?? '',
      entry.bib_number ?? '',
      entry.first_name ?? '',
      entry.last_name ?? '',
      entry.team ?? '',
      entry.division ?? '',
      entry.gender ?? '',
    ]

    cpList.forEach(cp => {
      const lap = grouped[entry.bib_number]?.[cp.id]
      row.push(cp.name)
      row.push(lap ? fmtTime(lap.elapsed_ms) : '')
    })

    rows.push(row)
  })

  downloadCSV(`race_${eventId}_lap_summary.csv`, rows)
}