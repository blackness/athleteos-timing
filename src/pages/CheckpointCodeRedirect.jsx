import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

export default function CheckpointCodeRedirect() {
  const { code } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    const normalized = String(code || '').trim()

    if (!normalized) {
      navigate('/', { replace: true })
      return
    }

    navigate(`/staff/${normalized}`, { replace: true })
  }, [code, navigate])

  return null
}