import { formatAdjustmentMs, sumAdjustments } from '../lib/raceAdjustments'

export default function AdjustmentMarker({ adjustments = [] }) {
  if (!adjustments.length) return null

  const total = sumAdjustments(adjustments)

  const tooltip = [
    'Official adjustment(s)',
    ...adjustments.map((a) => {
      const parts = [a.reason, formatAdjustmentMs(a.adjustment_ms)]
      if (a.note) parts.push(`(${a.note})`)
      return `• ${parts.join(' ')}`
    }),
    `Net: ${formatAdjustmentMs(total)}`,
  ].join('\n')

  return (
    <span
      title={tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 6,
        width: 16,
        height: 16,
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: 'rgba(245, 158, 11, 0.16)',
        color: '#b45309',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        cursor: 'help',
      }}
    >
      *
    </span>
  )
}