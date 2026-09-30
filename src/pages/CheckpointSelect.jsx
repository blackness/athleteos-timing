import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const F = "'Barlow Condensed', sans-serif"
const FB = "'Barlow', sans-serif"

export default function CheckpointSelect() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [race, setRace] = useState(null)
  const [checkpoints, setCheckpoints] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)

      const [{ data: raceData }, { data: checkpointData }] = await Promise.all([
        supabase.from('race_events').select('id,name,status').eq('id', id).single(),
          supabase
          .from('race_checkpoints')
          .select('*')
          .eq('event_id', id)
          .order('checkpoint_order', { ascending: true })
      ])

      if (!active) return

      setRace(raceData || null)
      setCheckpoints(checkpointData || [])
      setLoading(false)
    }

    load()

    return () => {
      active = false
    }
  }, [id])

  const openAdmin = checkpointId => {
    navigate(`/race/${id}/checkpoints/${checkpointId}/admin`)
  }

  const openDevice = checkpointId => {
    navigate(`/race/${id}/checkpoints/${checkpointId}/device`)
  }

  const openTimer = checkpointId => {
    navigate(`/race/${id}/checkpoints/${checkpointId}/timer`)
  }

  const openAssigner = checkpointId => {
    navigate(`/race/${id}/checkpoints/${checkpointId}/assign`)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#fff7ed',
        color: '#431407',
        fontFamily: FB,
        padding: 20,
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              fontFamily: F,
              fontWeight: 900,
              fontSize: 34,
              textTransform: 'uppercase',
              lineHeight: 1,
              color: '#9a3412',
            }}
          >
            Checkpoint Interfaces
          </div>

          <div style={{ marginTop: 8, color: '#7c2d12', fontSize: 14 }}>
            {race?.name || 'Race'}{race?.status ? ` · ${race.status}` : ''}
          </div>
        </div>

        {loading ? (
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #fed7aa',
              borderRadius: 16,
              padding: 20,
              color: '#9a3412',
            }}
          >
            Loading checkpoints...
          </div>
        ) : checkpoints.length === 0 ? (
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #fed7aa',
              borderRadius: 16,
              padding: 20,
              color: '#9a3412',
            }}
          >
            No checkpoints found.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {checkpoints.map(cp => (
              <div
                key={cp.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid #fed7aa',
                  borderRadius: 18,
                  padding: 18,
                  boxShadow: '0 10px 30px rgba(154,52,18,0.06)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 16,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: F,
                        fontSize: 26,
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        color: '#7c2d12',
                        lineHeight: 1,
                      }}
                    >
                      {cp.name || 'Checkpoint'}
                    </div>

                    <div style={{ marginTop: 6, fontSize: 13, color: '#9a3412' }}>
                      {cp.description || 'Open a checkpoint interface'}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      onClick={() => openAdmin(cp.id)}
                      style={btn('#7c2d12', '#ffffff')}
                    >
                      Admin
                    </button>

                    <button
                      onClick={() => openDevice(cp.id)}
                      style={btn('#ea580c', '#ffffff')}
                    >
                      Device
                    </button>

                    <button
                      onClick={() => openTimer(cp.id)}
                      style={btn('#2563eb', '#ffffff')}
                    >
                      Timer
                    </button>

                    <button
                      onClick={() => openAssigner(cp.id)}
                      style={btn('#0f766e', '#ffffff')}
                    >
                      Assigner
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function btn(bg, color) {
  return {
    height: 40,
    minWidth: 104,
    padding: '0 14px',
    borderRadius: 10,
    border: 'none',
    background: bg,
    color,
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 800,
    fontSize: 13,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    cursor: 'pointer',
  }
}