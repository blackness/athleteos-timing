import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName } }
        })
        if (error) throw error
        setMessage('Account created! Check your email for a verification link.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/')
      }
    } catch (err) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(135deg, #0d1117 0%, #1a1f2e 50%, #0d1117 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
      <div style={{
        background: '#0d1117', borderRadius: 24, padding: 32,
        width: '100%', maxWidth: 400, boxSizing: 'border-box',
        border: '1.5px solid #1f2937', boxShadow: '0 25px 60px rgba(0,0,0,0.5)'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(249,115,22,0.35)'
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2"/>
              <path d="M12 3C12 3 8 7 8 12C8 17 12 21 12 21" stroke="white" strokeWidth="1.5"/>
              <path d="M12 3C12 3 16 7 16 12C16 17 12 21 12 21" stroke="white" strokeWidth="1.5"/>
              <path d="M3 12H21" stroke="white" strokeWidth="1.5"/>
              <path d="M4.5 7.5H19.5" stroke="white" strokeWidth="1.5" opacity="0.6"/>
              <path d="M4.5 16.5H19.5" stroke="white" strokeWidth="1.5" opacity="0.6"/>
            </svg>
          </div>
          <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 800, margin: '0 0 4px', letterSpacing: -0.5 }}>
            Stat<span style={{ color: '#f97316' }}>Stream</span>
            <span style={{ color: '#6b7280', fontSize: 14, fontWeight: 500, marginLeft: 6 }}>Training</span>
          </h1>
          <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>
            {isSignUp ? 'Create your account' : 'Sign in to continue'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: '#7f1d1d', border: '1.5px solid #991b1b', color: '#fca5a5', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Success */}
        {message && (
          <div style={{ background: '#14532d', border: '1.5px solid #166534', color: '#86efac', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            ✓ {message}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isSignUp && (
            <div>
              <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, display: 'block', fontWeight: 600 }}>Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                placeholder="Jane Smith"
                style={{ width: '100%', background: '#111827', border: '1.5px solid #1f2937', borderRadius: 10, color: '#fff', fontSize: 15, padding: '11px 14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          )}

          <div>
            <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, display: 'block', fontWeight: 600 }}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={{ width: '100%', background: '#111827', border: '1.5px solid #1f2937', borderRadius: 10, color: '#fff', fontSize: 15, padding: '11px 14px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, display: 'block', fontWeight: 600 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
              style={{ width: '100%', background: '#111827', border: '1.5px solid #1f2937', borderRadius: 10, color: '#fff', fontSize: 15, padding: '11px 14px', outline: 'none', boxSizing: 'border-box' }}
            />
            {isSignUp && <p style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>Minimum 6 characters</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', border: 'none', borderRadius: 12,
              background: loading ? '#374151' : 'linear-gradient(135deg, #f97316, #ea580c)',
              color: '#fff', fontSize: 16, fontWeight: 800,
              padding: '14px 0', cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 4px 16px rgba(249,115,22,0.35)',
              transition: 'all 0.15s', marginTop: 4
            }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <svg style={{ animation: 'spin 1s linear infinite', width: 18, height: 18 }} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="4" fill="none" opacity="0.25"/>
                  <path fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Please wait...
              </span>
            ) : isSignUp ? '🚀 Create Account' : '🔐 Sign In'}
          </button>
        </form>

        {/* Toggle */}
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null) }}
            style={{ background: 'none', border: 'none', color: '#f97316', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            {isSignUp ? '← Already have an account? Sign in' : "Don't have an account? Sign up →"}
          </button>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #1f2937', textAlign: 'center' }}>
          <p style={{ color: '#374151', fontSize: 12, margin: '0 0 4px' }}>Track drills, PRs, and race times</p>
          <p style={{ color: '#374151', fontSize: 11, margin: 0 }}>Your data is secure and encrypted</p>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input::placeholder { color: #374151; }
        input:focus { border-color: #f97316 !important; }
      `}</style>
    </div>
  )
}
