import { supabase } from './supabase'

export const DEFAULT_XC_RACES = [
  { name: 'Novice Girls', distance: '4 km' },
  { name: 'Novice Boys', distance: '4 km' },
  { name: 'Junior Girls', distance: '5 km' },
  { name: 'Junior Boys', distance: '5 km' },
  { name: 'Senior Girls', distance: '6 km' },
  { name: 'Senior Boys', distance: '6 km' },
]

export async function createXCRaces({
  meetName,
  eventDate,
  location,
  races = DEFAULT_XC_RACES,
  userId,
  notes = null,
  sport = 'Cross Country',
}) {
  if (!meetName?.trim()) {
    throw new Error('Meet name is required')
  }

  if (!userId) {
    throw new Error('User ID is required')
  }

  const createdRaceIds = []
  const createdRaces = []

  try {
    for (const race of races) {
      const raceName = `${meetName} - ${race.name}`

      const { data: createdRace, error: raceError } = await supabase
        .from('race_events')
        .insert({
          user_id: userId,
          name: raceName,
          sport,
          distance: race.distance || null,
          event_date: eventDate || null,
          location: location || null,
          notes,
          status: 'draft',
          race_started_at: null,
          race_finished_at: null,
        })
        .select()
        .single()

      if (raceError) {
        throw new Error(`Failed to create race "${raceName}": ${raceError.message}`)
      }

      createdRaceIds.push(createdRace.id)
      createdRaces.push(createdRace)

      const { error: checkpointError } = await supabase
        .from('race_checkpoints')
        .insert([
          {
            event_id: createdRace.id,
            name: 'Start',
            checkpoint_order: 1,
            is_active: true,
          },
          {
            event_id: createdRace.id,
            name: 'Finish',
            checkpoint_order: 2,
            is_active: true,
          },
        ])

      if (checkpointError) {
        throw new Error(`Created "${raceName}" but failed to create checkpoints: ${checkpointError.message}`)
      }
    }

    return createdRaces
  } catch (err) {
    if (createdRaceIds.length > 0) {
      await supabase.from('race_checkpoints').delete().in('event_id', createdRaceIds)
      await supabase.from('race_events').delete().in('id', createdRaceIds)
    }
    throw err
  }
}