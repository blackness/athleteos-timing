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

      let data = null

      // First try short_code
      {
        const res = await supabase
          .from('race_checkpoints')
          .select('id, event_id')
          .eq('short_code', code)
          .single()

        if (res.data) data = res.data
      }

      // Fallback: try direct checkpoint UUID
      if (!data) {
        const res = await supabase
          .from('race_checkpoints')
          .select('id, event_id')
          .eq('id', code)
          .single()

        if (res.data) data = res.data
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
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#080b0f',
        color: '#4a5568',
        fontFamily: "'Barlow', sans-serif",
        fontSize: 14,
      }}
    >
      Loading checkpoint…
    </div>
  )
}