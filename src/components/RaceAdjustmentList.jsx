import { supabase } from '../lib/supabase'
import { formatAdjustmentMs } from '../lib/raceAdjustments'

export default function RaceAdjustmentList({ adjustments = [], onChanged }) {
  async function handleDelete(id) {
    const ok = window.confirm('Delete this adjustment?')
    if (!ok) return

    const { error } = await supabase
      .from('race_result_adjustments')
      .delete()
      .eq('id', id)

    if (error) {
      window.alert(error.message || 'Failed to delete adjustment')
      return
    }

    if (onChanged) onChanged()
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: 10,
        padding: 16,
        borderRadius: 12,
        border: '1px solid rgba(148,163,184,0.25)',
        background: '#fff',
      }}
    >
      <div style={{ fontWeight: 700 }}>Official Adjustments</div>

      {!adjustments.length ? (
        <div style={{ color: '#64748b', fontSize: 14 }}>No official adjustments yet.</div>
      ) : (
        adjustments.map((a) => (
          <div
            key={a.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              padding: 12,
              borderRadius: 10,
              background: '#f8fafc',
              border: '1px solid rgba(148,163,184,0.18)',
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>
                {a.bib_number ? `#${a.bib_number} · ` : ''}
                {a.reason}
              </div>
              <div style={{ fontSize: 13, color: '#475569' }}>
                {formatAdjustmentMs(a.adjustment_ms)}
                {a.note ? ` · ${a.note}` : ''}
              </div>
            </div>

            <button
              onClick={() => handleDelete(a.id)}
              style={{
                border: 0,
                background: '#fee2e2',
                color: '#b91c1c',
                borderRadius: 8,
                padding: '8px 10px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Delete
            </button>
          </div>
        ))
      )}
    </div>
  )
}