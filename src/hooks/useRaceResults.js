/**
 * useRaceResults.js
 * 
 * Real-time subscription hook for race finishes.
 * Place in src/hooks/useRaceResults.js
 * 
 * Usage in CVDashboard:
 *   import { useRaceResults } from '../hooks/useRaceResults'
 *   const { results, loading, isLive } = useRaceResults(eventId)
 */

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useRaceResults(eventId) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [isLive, setIsLive] = useState(false)
  const channelRef = useRef(null)

  useEffect(() => {
    if (!eventId) return

    // ── Initial fetch ──
    async function fetchResults() {
      setLoading(true)
      const { data, error } = await supabase
        .from('race_finishes')
        .select('*')
        .eq('event_id', eventId)
        .order('place', { ascending: true })

      if (!error && data) {
        setResults(data)
        // If any result was created in the last 5 minutes, consider race "live"
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const hasRecent = data.some(r => r.created_at > fiveMinAgo)
        setIsLive(hasRecent)
      }
      setLoading(false)
    }

    fetchResults()

    // ── Real-time subscription ──
    channelRef.current = supabase
      .channel(`race-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'race_finishes',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          // New finisher — append to results
          setResults(prev => {
            const exists = prev.some(r => r.id === payload.new.id)
            if (exists) return prev
            const updated = [...prev, payload.new].sort((a, b) => a.place - b.place)
            return updated
          })
          setIsLive(true)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'race_finishes',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          // Updated finisher (bib assigned, flag resolved, etc.)
          setResults(prev =>
            prev.map(r => r.id === payload.new.id ? payload.new : r)
          )
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'race_finishes',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          // Deleted finisher (undo)
          setResults(prev => prev.filter(r => r.id !== payload.old.id))
        }
      )
      .subscribe()

    // ── Cleanup ──
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [eventId])

  return { results, loading, isLive }
}

/**
 * Helper: compute team scores from results
 */
export function computeTeamScores(results, teams) {
  const scores = {}
  teams.forEach(t => { scores[t.name] = { team: t, places: [], total: 0 } })
  
  results.forEach(r => {
    // You'd need team info from a participants/registration table
    // For now this works with results that have team data attached
    if (r.team && scores[r.team] && scores[r.team].places.length < 5) {
      scores[r.team].places.push(r.place)
      scores[r.team].total += r.place
    }
  })

  return Object.values(scores)
    .filter(s => s.places.length > 0)
    .sort((a, b) => {
      if (a.places.length !== b.places.length) return b.places.length - a.places.length
      return a.total - b.total
    })
}
