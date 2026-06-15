import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { QRCodeCanvas } from 'qrcode.react'

const C = {
  bg: '#ffffff',
  text: '#111827',
  muted: '#6b7280',
  border: '#d1d5db',
  orange: '#f97316',
}

const fontHead = "'Barlow Condensed', sans-serif"
const fontBody = "'Barlow', sans-serif"

export default function CheckpointQrSheet() {
  const { id: eventId } = useParams()
  const navigate = useNavigate()

  const [event, setEvent] = useState(null)
  const [checkpoints, setCheckpoints] = useState([])

  useEffect(() => {
    if (!eventId) return

    async function load() {
      const [
        { data: eventData },
        { data: checkpointData },
      ] = await Promise.all([
        supabase.from('race_events').select('*').eq('id', eventId).single(),
        supabase
          .from('race_checkpoints')
          .select('*')
          .eq('event_id', eventId)
          .eq('is_active', true)
          .order('checkpoint_order', { ascending: true }),
      ])

      setEvent(eventData || null)
      setCheckpoints(checkpointData || [])
    }

    load()
  }, [eventId])

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, color: C.text, fontFamily: fontBody }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />

      <div className="no-print" style={{ padding: 16, borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => navigate(`/race/${eventId}/checkpoints`)}
          style={{
            border: `1px solid ${C.border}`,
            background: '#fff',
            color: C.muted,
            borderRadius: 8,
            padding: '8px 12px',
            cursor: 'pointer',
            fontFamily: fontHead,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          ← Back
        </button>

        <button
          onClick={() => window.print()}
          style={{
            border: 'none',
            background: C.orange,
            color: '#fff',
            borderRadius: 8,
            padding: '8px 12px',
            cursor: 'pointer',
            fontFamily: fontHead,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          Print
        </button>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: C.orange, letterSpacing: 2, fontFamily: fontHead, fontWeight: 700, textTransform: 'uppercase' }}>
            Checkpoint QR Sheet
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, fontFamily: fontHead }}>
            {event?.name ?? 'Race'}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
            Scan a checkpoint card to open the timer directly on a device.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
          {checkpoints.map(cp => {
            const quickCode = cp.short_code || cp.id
            const quickUrl = `${window.location.origin}/c/${quickCode}`

            return (
              <div
                key={cp.id}
                style={{
                  border: `2px solid ${C.border}`,
                  borderRadius: 16,
                  padding: 18,
                  background: '#fff',
                  breakInside: 'avoid',
                }}
              >
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: C.orange, letterSpacing: 2, fontFamily: fontHead, fontWeight: 700, textTransform: 'uppercase' }}>
                    Checkpoint {cp.checkpoint_order}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 900, fontFamily: fontHead, lineHeight: 1.05 }}>
                    {cp.name}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <QRCodeCanvas
                    value={quickUrl}
                    size={150}
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: fontHead, fontWeight: 700, marginBottom: 6 }}>
                      Quick Code
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, fontFamily: fontHead, marginBottom: 12 }}>
                      {quickCode}
                    </div>

                    <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: fontHead, fontWeight: 700, marginBottom: 6 }}>
                      URL
                    </div>
                    <div style={{ fontSize: 12, color: C.text, wordBreak: 'break-all' }}>
                      {quickUrl}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.border}`, fontSize: 12, color: C.muted }}>
                  Scan QR → login if needed → tap LAP → assign bib
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>
    </div>
  )
}