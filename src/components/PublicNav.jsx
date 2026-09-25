import { Link } from 'react-router-dom'
import { getPublicHomePath } from '../lib/routes'

export default function PublicNav({
  theme,
  homeLabel = 'Home',
  extraLinks = [],
  currentPath = null,
}) {
  const styles = getStyles(theme)

  function linkStyle(to) {
    const active = currentPath && currentPath === to
    return {
      ...styles.link,
      color: active ? theme.text : theme.secondaryText,
      fontWeight: active ? 800 : 700,
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.inner}>
        <Link to={getPublicHomePath()} style={linkStyle(getPublicHomePath())}>
          {homeLabel}
        </Link>

        {extraLinks.map(link => (
          <Link key={link.to} to={link.to} style={linkStyle(link.to)}>
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

function getStyles(theme) {
  return {
    wrap: {
      background: theme.cardBg,
      borderBottom: `1px solid ${theme.border}`,
      marginBottom: 20,
    },
    inner: {
      maxWidth: 1200,
      margin: '0 auto',
      padding: '12px 24px',
      display: 'flex',
      gap: 16,
      flexWrap: 'wrap',
      alignItems: 'center',
    },
    link: {
      textDecoration: 'none',
      fontSize: 14,
    },
  }
}