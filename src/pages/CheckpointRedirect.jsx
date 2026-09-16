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
      let checkpoint = null

      const byShort = await supabase
        .from('race_checkpoints')
        .select('id, event_id, short_code')
        .ilike('short_code', normalizedCode)
        .maybeSingle()

      if (byShort.data) checkpoint = byShort.data

      if (!checkpoint) {
        const byId = await supabase
          .from('race_checkpoints')
          .select('id, event_id')
          .eq('id', code)
          .maybeSingle()

        if (byId.data) checkpoint = byId.data
      }

      if (!checkpoint?.event_id || !checkpoint?.id) {
        navigate('/', { replace: true })
        return
      }

      const targetPath = `/race/${checkpoint.event_id}/checkpoint/${checkpoint.id}`

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session?.user) {
        navigate(targetPath, { replace: true })
        return
      }

      navigate(`/login?next=${encodeURIComponent(targetPath)}`, { replace: true })
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
        fontFamily: 'sans-serif',
        color: '#475569',
        background: '#080b0f',
      }}
    >
      Loading checkpoint…
    </div>
  )
}