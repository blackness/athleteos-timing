import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function CheckpointRedirect() {
  const { id: eventId, checkpointId } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    let active = true

    async function go() {
      if (!eventId || !checkpointId) {
        navigate('/', { replace: true })
        return
      }

      const { data: checkpoint } = await supabase
        .from('race_checkpoints')
        .select('id,event_id')
        .eq('id', checkpointId)
        .eq('event_id', eventId)
        .single()

      if (!active) return

      if (!checkpoint) {
        navigate(`/race/${eventId}/checkpoints`, { replace: true })
        return
      }

      navigate(
        `/race/${checkpoint.event_id}/checkpoints/${checkpoint.id}/admin`,
        { replace: true }
      )
    }

    go()

    return () => {
      active = false
    }
  }, [eventId, checkpointId, navigate])

  return null
}