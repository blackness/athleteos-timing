<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
  <Link
    to={`/race/${id}/control`}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      padding: '0 14px',
      borderRadius: 10,
      textDecoration: 'none',
      background: '#f97316',
      color: '#fff',
      fontFamily: "'Barlow Condensed', sans-serif",
      fontWeight: 800,
      fontSize: 14,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    }}
  >
    Race Control
  </Link>

  <Link
    to={`/race/${id}/live-board`}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      padding: '0 14px',
      borderRadius: 10,
      textDecoration: 'none',
      background: '#2563eb',
      color: '#fff',
      fontFamily: "'Barlow Condensed', sans-serif",
      fontWeight: 800,
      fontSize: 14,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    }}
  >
    Open Live Board
  </Link>
</div>