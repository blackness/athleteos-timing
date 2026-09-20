import { Navigate, useParams } from 'react-router-dom'
import { clearStaffSession, getStaffSession } from '../lib/staffAccess'

export default function StaffRouteGuard({ allowedRole, children }) {
  const { accessCode } = useParams()
  const session = getStaffSession(accessCode)

  if (!session) {
    return <Navigate to={`/staff/${accessCode}`} replace />
  }

  if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
    clearStaffSession(accessCode)
    return <Navigate to={`/staff/${accessCode}`} replace />
  }

  if (allowedRole && session.role !== allowedRole) {
    return <Navigate to={`/staff/${accessCode}`} replace />
  }

  return children
}