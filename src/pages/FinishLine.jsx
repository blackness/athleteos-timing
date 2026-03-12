import { useState, useEffect, useRef, useCallback } from 'react'

// ── Audio beep via Web Audio API ──
function createBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.15)
  } catch {}
}

function formatTime(ms) {
  if (ms == null) return '0:00.00'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const cs = Math.floor((ms % 1000) / 10)
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`
  return `${m}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`
}

function formatTimeShort(ms) {
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const cs = Math.floor((ms % 1000) / 10)
  return `${m}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`
}

// Layout modes
const LAYOUTS = ['split', 'center', 'minimal']
const LAYOUT_LABELS = { split: 'Split', center: 'Center', minimal: 'Minimal' }

export default function FinishLine({ eventId, onClose }) {
  const [phase, setPhase] = useState('ready') // ready | racing | finished
  const [layout, setLayout] = useState('split')
  const [finishers, setFinishers] = useState([])
  const [elapsed, setElapsed] = useState(0)
  const [toasts, setToasts] = useState([])
  const [tapFlash, setTapFlash] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editBib, setEditBib] = useState('')

  const startTimeRef = useRef(null)
  const rafRef = useRef(null)
  const finishersRef = useRef(finishers)
  finishersRef.current = finishers

  // Clock tick
  useEffect(() => {
    if (phase !== 'racing') return
    const tick = () => {
      setElapsed(performance.now() - startTimeRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase])

  // Keyboard spacebar
  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'Space' && phase === 'racing') {
        e.preventDefault()
        recordFinish()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase])

  // Auto-dismiss toasts
  useEffect(() => {
    if (toasts.length === 0) return
    const t = setTimeout(() => {
      setToasts(prev => prev.filter(t => !t.expiring))
    }, 300)
    return () => clearTimeout(t)
  }, [toasts])

  function startRace() {
    startTimeRef.current = performance.now()
    setPhase('racing')
    setFinishers([])
    setElapsed(0)
  }

  const recordFinish = useCallback(() => {
    const now = performance.now()
    const time_ms = Math.round(now - startTimeRef.current)

    // Round to nearest 250ms
    const rounded = Math.round(time_ms / 250) * 250

    const finish = {
      id: crypto.randomUUID(),
      place: finishersRef.current.length + 1,
      time_ms: rounded,
      raw_ms: time_ms,
      bib: null,
      synced: false,
      created_at: new Date().toISOString()
    }

    setFinishers(prev => [finish, ...prev])
    createBeep()

    // Flash
    setTapFlash(true)
    setTimeout(() => setTapFlash(false), 120)

    // Toast with undo
    const toastId = finish.id
    setToasts(prev => [...prev, {
      id: toastId,
      finishId: finish.id,
      place: finish.place,
      time_ms: rounded,
      expiring: false
    }])

    // Auto-expire toast after 5s
    setTimeout(() => {
      setToasts(prev => prev.map(t =>
        t.id === toastId ? { ...t, expiring: true } : t
      ))
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toastId))
      }, 300)
    }, 5000)

    // TODO: sync to Supabase
    // trySync(finish)
  }, [])

  function undoFinish(finishId) {
    setFinishers(prev => {
      const removed = prev.find(f => f.id === finishId)
      if (!removed) return prev
      // Re-number places after removal
      return prev
        .filter(f => f.id !== finishId)
        .map((f, i) => ({ ...f, place: prev.length - 1 - i }))
        .reverse()
        .map((f, i) => ({ ...f, place: i + 1 }))
        .reverse()
    })
    setToasts(prev => prev.filter(t => t.finishId !== finishId))
  }

  function assignBib(finishId, bib) {
    setFinishers(prev => prev.map(f =>
      f.id === finishId ? { ...f, bib } : f
    ))
    setEditingId(null)
    setEditBib('')
  }

  function deleteFinisher(finishId) {
    setFinishers(prev => {
      const filtered = prev.filter(f => f.id !== finishId)
      // Re-number
      return [...filtered].reverse().map((f, i) => ({ ...f, place: i + 1 })).reverse()
    })
  }

  // ── Tap handler — prevent double-tap ──
  const lastTapRef = useRef(0)
  function handleTap(e) {
    if (phase !== 'racing') return
    // Ignore if tapping a button inside the zone
    if (e.target.closest('button, input')) return
    const now = Date.now()
    if (now - lastTapRef.current < 300) return // debounce 300ms
    lastTapRef.current = now
    recordFinish()
  }

  const recentFinishers = [...finishers].sort((a, b) => a.place - b.place)

  // ════════════════════════════════════
  // READY screen
  // ════════════════════════════════════
  if (phase === 'ready') {
    return (
      <div style={{
        minHeight: '100dvh', background: '#080b0f',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Barlow Condensed', sans-serif",
        padding: 24, gap: 32
      }}>
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:wght@300;400;500;600&display=swap" rel="stylesheet" />

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, letterSpacing: 4, color: '#4a5568', textTransform: 'uppercase', marginBottom: 12 }}>
            Finish Line
          </div>
          <div style={{ fontSize: 72, fontWeight: 900, color: '#f0f4f8', letterSpacing: -2, lineHeight: 1 }}>
            READY
          </div>
          <div style={{ fontSize: 18, color: '#4a5568', marginTop: 8, fontFamily: 'Barlow, sans-serif', fontWeight: 300 }}>
            Tap START when the gun fires
          </div>
        </div>

        {/* Layout picker */}
        <div style={{ display: 'flex', gap: 8 }}>
          {LAYOUTS.map(l => (
            <button key={l} onClick={() => setLayout(l)} style={{
              padding: '8px 20px', borderRadius: 8,
              border: `1.5px solid ${layout === l ? '#f97316' : '#1e2730'}`,
              background: layout === l ? 'rgba(249,115,22,0.1)' : 'transparent',
              color: layout === l ? '#f97316' : '#4a5568',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 13, fontWeight: 700, letterSpacing: 1,
              textTransform: 'uppercase', cursor: 'pointer'
            }}>
              {LAYOUT_LABELS[l]}
            </button>
          ))}
        </div>

        <button
          onClick={startRace}
          style={{
            width: 180, height: 180, borderRadius: '50%',
            background: 'linear-gradient(135deg, #16a34a, #15803d)',
            border: 'none', color: '#fff',
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 28, fontWeight: 900, letterSpacing: 3,
            textTransform: 'uppercase', cursor: 'pointer',
            boxShadow: '0 0 60px rgba(22,163,74,0.4), 0 0 120px rgba(22,163,74,0.15)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 4,
            transition: 'transform 0.15s',
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <span style={{ fontSize: 40 }}>▶</span>
          START
        </button>

        <div style={{ fontSize: 13, color: '#2d3748', fontFamily: 'Barlow, sans-serif' }}>
          Spacebar or clicker also works during race
        </div>
      </div>
    )
  }

  // ════════════════════════════════════
  // RACING screens
  // ════════════════════════════════════

  const clockDisplay = (size = 72) => (
    <div style={{
      fontFamily: "'Barlow Condensed', sans-serif",
      fontSize: size, fontWeight: 900,
      color: '#f0f4f8', letterSpacing: -2,
      lineHeight: 1, tabularNums: true,
      fontVariantNumeric: 'tabular-nums'
    }}>
      {formatTime(elapsed)}
    </div>
  )

  const finisherList = (maxHeight = '40vh') => (
    <div style={{
      overflowY: 'auto', maxHeight,
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      {recentFinishers.length === 0 ? (
        <div style={{ color: '#2d3748', fontSize: 14, fontFamily: 'Barlow, sans-serif', textAlign: 'center', padding: '20px 0' }}>
          No finishers yet
        </div>
      ) : (
        recentFinishers.map(f => (
          <div key={f.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 12px', borderRadius: 8,
            background: '#0e1318',
            border: '1px solid #1e2730',
          }}>
            {/* Place */}
            <div style={{
              width: 28, height: 28, borderRadius: 6, flexShrink: 0,
              background: f.place <= 3 ? ['#ca8a04','#6b7280','#92400e'][f.place-1] : '#1e2730',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 13, fontWeight: 800, color: '#fff'
            }}>
              {f.place}
            </div>

            {/* Time */}
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 18, fontWeight: 700, color: '#f0f4f8',
              flex: 1, letterSpacing: 0.5
            }}>
              {formatTimeShort(f.time_ms)}
            </div>

            {/* Bib */}
            {editingId === f.id ? (
              <input
                autoFocus
                value={editBib}
                onChange={e => setEditBib(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') assignBib(f.id, editBib)
                  if (e.key === 'Escape') { setEditingId(null); setEditBib('') }
                }}
                placeholder="Bib #"
                style={{
                  width: 64, padding: '3px 8px', borderRadius: 6,
                  background: '#080b0f', border: '1.5px solid #f97316',
                  color: '#fff', fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 14, fontWeight: 700, outline: 'none'
                }}
              />
            ) : (
              <button onClick={() => { setEditingId(f.id); setEditBib(f.bib || '') }} style={{
                padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                background: f.bib ? '#1e2730' : 'transparent',
                border: `1px solid ${f.bib ? '#374151' : '#1e2730'}`,
                color: f.bib ? '#f0f4f8' : '#374151',
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 13, fontWeight: 700, minWidth: 44, textAlign: 'center'
              }}>
                {f.bib || '—'}
              </button>
            )}

            {/* Sync dot */}
            <div style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: f.synced ? '#10b981' : '#374151'
            }} title={f.synced ? 'Synced' : 'Queued'} />

            {/* Delete */}
            <button onClick={() => deleteFinisher(f.id)} style={{
              background: 'none', border: 'none', color: '#374151',
              fontSize: 16, cursor: 'pointer', lineHeight: 1,
              padding: '0 2px', flexShrink: 0,
              transition: 'color 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color = '#374151'}
            >
              ×
            </button>
          </div>
        ))
      )}
    </div>
  )

  const tapZone = (flex = 1, style = {}) => (
    <div
      onPointerDown={handleTap}
      style={{
        flex, position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none',
        background: tapFlash
          ? 'rgba(249,115,22,0.12)'
          : 'rgba(249,115,22,0.03)',
        transition: 'background 0.08s ease',
        borderRadius: 16,
        border: `2px solid ${tapFlash ? 'rgba(249,115,22,0.4)' : 'rgba(249,115,22,0.08)'}`,
        ...style
      }}
    >
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 12, pointerEvents: 'none'
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          border: `2px solid ${tapFlash ? 'rgba(249,115,22,0.6)' : 'rgba(249,115,22,0.15)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.08s'
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: tapFlash ? '#f97316' : 'rgba(249,115,22,0.3)',
            transition: 'background 0.08s'
          }} />
        </div>
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 15, fontWeight: 700, letterSpacing: 3,
          textTransform: 'uppercase',
          color: tapFlash ? '#f97316' : 'rgba(249,115,22,0.3)',
          transition: 'color 0.08s'
        }}>
          Tap to Finish · Space
        </div>
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 13, fontWeight: 600, letterSpacing: 1,
          color: '#2d3748'
        }}>
          Place {finishers.length + 1}
        </div>
      </div>
    </div>
  )

  // Shared top bar
  const topBar = (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px',
      borderBottom: '1px solid #1e2730',
      background: '#080b0f', flexShrink: 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }} />
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 12, fontWeight: 700, letterSpacing: 3,
          textTransform: 'uppercase', color: '#22c55e'
        }}>Live</span>
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 12, color: '#2d3748', letterSpacing: 1
        }}>· {finishers.length} finisher{finishers.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {LAYOUTS.map(l => (
          <button key={l} onClick={() => setLayout(l)} style={{
            padding: '4px 12px', borderRadius: 6,
            border: `1px solid ${layout === l ? '#f97316' : '#1e2730'}`,
            background: layout === l ? 'rgba(249,115,22,0.1)' : 'transparent',
            color: layout === l ? '#f97316' : '#374151',
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 11, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase', cursor: 'pointer'
          }}>
            {LAYOUT_LABELS[l]}
          </button>
        ))}
        <button onClick={() => setPhase('ready')} style={{
          padding: '4px 12px', borderRadius: 6,
          border: '1px solid #1e2730',
          background: 'transparent', color: '#374151',
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 11, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase', cursor: 'pointer', marginLeft: 8
        }}>
          End
        </button>
      </div>
    </div>
  )

  // Toasts
  const toastStack = (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex', flexDirection: 'column', gap: 8,
      zIndex: 100, pointerEvents: 'none',
      alignItems: 'center'
    }}>
      {toasts.map(toast => (
        <div key={toast.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: '#0e1318', border: '1.5px solid #1e2730',
          borderRadius: 12, padding: '10px 16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          pointerEvents: 'all',
          opacity: toast.expiring ? 0 : 1,
          transform: toast.expiring ? 'translateY(8px)' : 'translateY(0)',
          transition: 'opacity 0.3s, transform 0.3s',
          minWidth: 240
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, flexShrink: 0,
            background: toast.place <= 3 ? ['#ca8a04','#6b7280','#92400e'][toast.place-1] : '#1e2730',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 13, fontWeight: 800, color: '#fff'
          }}>
            {toast.place}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 18, fontWeight: 700, color: '#f0f4f8', lineHeight: 1
            }}>
              {formatTimeShort(toast.time_ms)}
            </div>
            <div style={{ fontSize: 11, color: '#4a5568', marginTop: 2 }}>Place {toast.place}</div>
          </div>
          <button
            onClick={() => undoFinish(toast.finishId)}
            style={{
              padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#f87171',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 12, fontWeight: 700, letterSpacing: 1,
              textTransform: 'uppercase'
            }}
          >
            Undo
          </button>
        </div>
      ))}
    </div>
  )

  // ── LAYOUT: SPLIT ──
  if (layout === 'split') {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#080b0f', overflow: 'hidden' }}>
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:wght@300;400;500;600&display=swap" rel="stylesheet" />
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
        {topBar}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', gap: 0 }}>
          {/* Left: clock + tap */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: 24, gap: 16,
            borderRight: '1px solid #1e2730'
          }}>
            {clockDisplay(80)}
            <div style={{ color: '#2d3748', fontSize: 13, fontFamily: 'Barlow, sans-serif', letterSpacing: 1 }}>
              ELAPSED
            </div>
            {tapZone(1, { width: '100%', minHeight: 200, marginTop: 16 })}
          </div>
          {/* Right: finisher list */}
          <div style={{ width: 280, display: 'flex', flexDirection: 'column', padding: 12, gap: 8, overflow: 'hidden' }}>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 11, fontWeight: 700, letterSpacing: 3,
              textTransform: 'uppercase', color: '#2d3748', padding: '4px 4px 8px'
            }}>
              Finishers — tap bib to assign
            </div>
            {finisherList('calc(100vh - 120px)')}
          </div>
        </div>
        {toastStack}
      </div>
    )
  }

  // ── LAYOUT: CENTER ──
  if (layout === 'center') {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#080b0f', overflow: 'hidden' }}>
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:wght@300;400;500;600&display=swap" rel="stylesheet" />
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
        {topBar}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16, gap: 12 }}>
          {/* Clock centered */}
          <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
            {clockDisplay(96)}
            <div style={{ color: '#2d3748', fontSize: 12, fontFamily: 'Barlow, sans-serif', letterSpacing: 2, marginTop: 6 }}>
              ELAPSED · NEXT PLACE {finishers.length + 1}
            </div>
          </div>
          {/* Full width tap zone */}
          {tapZone(0, { height: 140, width: '100%' })}
          {/* Finisher list below */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 11, fontWeight: 700, letterSpacing: 3,
              textTransform: 'uppercase', color: '#2d3748'
            }}>
              Finishers — tap bib to assign
            </div>
            {finisherList('calc(100vh - 380px)')}
          </div>
        </div>
        {toastStack}
      </div>
    )
  }

  // ── LAYOUT: MINIMAL ──
  if (layout === 'minimal') {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#080b0f', overflow: 'hidden' }}>
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:wght@300;400;500;600&display=swap" rel="stylesheet" />
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
        {topBar}
        {/* Entire screen is tap zone with floating clock */}
        <div
          onPointerDown={handleTap}
          style={{
            flex: 1, position: 'relative',
            background: tapFlash ? 'rgba(249,115,22,0.08)' : '#080b0f',
            transition: 'background 0.08s',
            cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          {/* Giant clock */}
          <div style={{ textAlign: 'center', pointerEvents: 'none' }}>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 'clamp(72px, 20vw, 140px)',
              fontWeight: 900, color: tapFlash ? '#f97316' : '#f0f4f8',
              letterSpacing: -4, lineHeight: 1,
              transition: 'color 0.08s',
              fontVariantNumeric: 'tabular-nums'
            }}>
              {formatTime(elapsed)}
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 16, fontWeight: 700, letterSpacing: 4,
              textTransform: 'uppercase',
              color: tapFlash ? 'rgba(249,115,22,0.6)' : '#1e2730',
              marginTop: 12, transition: 'color 0.08s'
            }}>
              TAP ANYWHERE · PLACE {finishers.length + 1}
            </div>
          </div>

          {/* Floating finisher strip at bottom */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '12px 16px',
            background: 'linear-gradient(0deg, rgba(8,11,15,0.95) 0%, transparent 100%)',
            display: 'flex', gap: 8, overflowX: 'auto',
            pointerEvents: 'all'
          }}>
            {recentFinishers.slice(-8).map(f => (
              <div key={f.id} style={{
                flexShrink: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 2,
                background: '#0e1318', borderRadius: 8,
                padding: '6px 10px', border: '1px solid #1e2730',
                minWidth: 64
              }}>
                <div style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 11, fontWeight: 700, color: '#4a5568'
                }}>#{f.place}</div>
                <div style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 14, fontWeight: 700, color: '#f0f4f8'
                }}>{formatTimeShort(f.time_ms)}</div>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingId(f.id); setEditBib(f.bib || '') }}
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 11, color: f.bib ? '#f97316' : '#374151', fontWeight: 700
                  }}
                >
                  {f.bib ? `Bib ${f.bib}` : '+ bib'}
                </button>
              </div>
            ))}
          </div>
        </div>
        {toastStack}
      </div>
    )
  }
}
