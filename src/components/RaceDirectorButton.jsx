import { Link } from 'react-router-dom'
import { getRaceDirectorPath } from '../lib/routes'
import { useTheme } from '../contexts/ThemeContext'

export default function RaceDirectorButton({ raceId, children = 'Director', style = {} }) {
  const { theme } = useTheme()

  return (
    <Link
      to={getRaceDirectorPath(raceId)}
      style={{
        display: 'inline-block',
        textDecoration: 'none',
        padding: '10px 14px',
        borderRadius: 10,
        background: theme.primary,
        color: theme.primaryText,
        fontWeight: 800,
        ...style,
      }}
    >
      {children}
    </Link>
  )
}