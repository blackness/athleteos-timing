import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { darkTheme, lightTheme } from '../theme'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem('themeMode')
    if (saved === 'light' || saved === 'dark') return saved
    return 'dark'
  })

  useEffect(() => {
    localStorage.setItem('themeMode', mode)
  }, [mode])

  const value = useMemo(() => {
    return {
      mode,
      setMode,
      theme: mode === 'light' ? lightTheme : darkTheme,
      toggleMode: () => setMode(current => (current === 'dark' ? 'light' : 'dark')),
    }
  }, [mode])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  return context
}