import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function RaceAdjustmentForm({ eventId, entries = [], onSaved }) {
  const [selectedEntryId, setSelectedEntryId] = useState('')
  const [direction, setDirection] = useState('subtract')
  const [minutes, setMinutes] = useState('0')
  const [seconds, setSeconds] = useState('0')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === selectedEntryId) || null,
    [entries, selectedEntryId]
  )

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!selectedEntry) {
      setError('Select an athlete/team')
      return
    }

    if (!reason.trim()) {
      setError('Reason is required')
      return
    }

    const mins = Number(minutes || 0)
    const secs = Number(seconds || 0)
    const totalMs = ((mins * 60) + secs) * 1000

    if (!totalMs) {
      setError('Enter a non-zero adjustment')
      return
    }

    const adjustmentMs = direction === 'subtract' ? -totalMs : totalMs

    setSaving(true)

    const { error: insertError } = await supabase
      .from('race_result_adjustments')
      .insert({
        event_id: eventId,
        entry_id: selectedEntry.id,
        bib_number: selectedEntry.bib_number || null,
        adjustment_ms: adjustmentMs,
        reason: reason.trim(),
        note: note.trim() || null,
      })

    setSaving(false)

    if (insertError) {
      setError(insertError.message || 'Failed to save adjustment')
      return
    }

    setMinutes('0')
    setSeconds('0')
    setReason('')
    setNote('')

    if (onSaved) onSaved()
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'grid',
        gap: 12,
        padding: 16,
        borderRadius: 12,
        border: '1px solid rgba(148,163,184,0.25)',
        background: '#fff',
      }}
    >
      <div style={{ fontWeight: 700 }}>Official Time Adjustment</div>

      <label style={{ display: 'grid', gap: 6 }}>
        <span>Athlete / Team</span>
        <select
          value={selectedEntryId}
          onChange={(e) => setSelectedEntryId(e.target.value)}
          style={{ padding: 10 }}
        >
          <option value="">Select athlete/team</option>
          {entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {[
                entry.bib_number ? `#${entry.bib_number}` : null,
                entry.display_name || entry.team || 'Unnamed',
              ].filter(Boolean).join(' — ')}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Direction</span>
          <select value={direction} onChange={(e) => setDirection(e.target.value)} style={{ padding: 10 }}>
            <option value="subtract">Subtract time</option>
            <option value="add">Add penalty</option>
          </select>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Minutes</span>
          <input
            type="number"
            min="0"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            style={{ padding: 10, width: 100 }}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Seconds</span>
          <input
            type="number"
            min="0"
            max="59"
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
            style={{ padding: 10, width: 100 }}
          />
        </label>
      </div>

      <label style={{ display: 'grid', gap: 6 }}>
        <span>Reason</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Pool lane delay, Train crossing delay, etc."
          style={{ padding: 10 }}
        />
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span>Note</span>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional detail"
          style={{ padding: 10 }}
        />
      </label>

      {error ? <div style={{ color: '#b91c1c', fontSize: 14 }}>{error}</div> : null}

      <button
        type="submit"
        disabled={saving}
        style={{
          padding: '10px 14px',
          borderRadius: 10,
          border: 0,
          background: '#0f766e',
          color: '#fff',
          fontWeight: 700,
          cursor: saving ? 'default' : 'pointer',
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? 'Saving...' : 'Save Adjustment'}
      </button>
    </form>
  )
}