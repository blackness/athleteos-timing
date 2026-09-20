import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const lastProfileUserIdRef = useRef(null)
  const fetchingProfileRef = useRef(false)

  useEffect(() => {
    let mounted = true

    async function initializeAuth() {
      try {
        const hash = window.location.hash

        if (hash.includes('access_token')) {
          const params = new URLSearchParams(hash.replace('#', ''))
          const access_token = params.get('access_token')
          const refresh_token = params.get('refresh_token')

          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token })
            window.history.replaceState(null, '', window.location.pathname)
          }
        }

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (!mounted) return

        if (error) {
          console.error('Auth getSession error:', error)
          setUser(null)
          setProfile(null)
          setLoading(false)
          return
        }

        const nextUser = session?.user ?? null
        setUser(nextUser)

        if (nextUser?.id) {
          await fetchProfile(nextUser.id)
        } else {
          setProfile(null)
          setLoading(false)
        }
      } catch (err) {
        console.error('Auth initialization error:', err)
        if (!mounted) return
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    }

    initializeAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUser = session?.user ?? null
      setUser(nextUser)

      if (!nextUser?.id) {
        lastProfileUserIdRef.current = null
        setProfile(null)
        setLoading(false)
        return
      }

      if (lastProfileUserIdRef.current === nextUser.id) {
        setLoading(false)
        return
      }

      await fetchProfile(nextUser.id)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function fetchProfile(userId) {
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }

    if (fetchingProfileRef.current && lastProfileUserIdRef.current === userId) {
      return
    }

    fetchingProfileRef.current = true

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        console.error('Profile fetch error:', error)
        setProfile(null)
        setLoading(false)
        return
      }

      lastProfileUserIdRef.current = userId
      setProfile(data ?? null)
      setLoading(false)
    } catch (err) {
      console.error('Profile fetch exception:', err)
      setProfile(null)
      setLoading(false)
    } finally {
      fetchingProfileRef.current = false
    }
  }

  const value = {
    user,
    profile,
    loading,
    isCoach: profile?.role === 'coach',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)