import { Navigate, useParams } from 'react-router-dom'

export default function RaceHomeRedirect() {
  const { id } = useParams()
  return <Navigate to={`/race/${id}/setup`} replace />
}