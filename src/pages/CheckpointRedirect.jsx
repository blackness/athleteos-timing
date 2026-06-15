import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function CheckpointRedirect() {
  const { code } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    async function go() {
      if (!code) {
        navigate('/', { replace: true })
        return
      }

      const normalizedCode = code.trim().toUpperCase()
      let data = null

      const byShort = await supabase
        .from('race_checkpoints')
        .select('id, event_id, short_code')
        .ilike('short_code', normalizedCode)
        .maybeSingle()

      if (byShort.data) data = byShort.data

      if (!data) {
        const byId = await supabase
          .from('race_checkpoints')
          .select('id, event_id')
          .eq('id', code)
          .maybeSingle()

        if (byId.data) data = byId.data
      }

      if (data?.event_id && data?.id) {
        navigate(`/race/${data.event_id}/checkpoint/${data.id}`, { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    }

    go()
  }, [code, navigate])

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading checkpoint…
    </div>
  )
}