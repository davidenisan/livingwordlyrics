import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'lwl-theme'

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function savedTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

// Light/dark theme for the public site. Follows the system setting until the
// visitor picks one; index.html applies it before first paint.
export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || savedTheme() || systemTheme())

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d0f0c' : '#11261b')
  }, [theme])

  useEffect(() => {
    if (savedTheme()) return undefined
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onChange = (event) => setTheme(event.matches ? 'dark' : 'light')
    media?.addEventListener?.('change', onChange)
    return () => media?.removeEventListener?.('change', onChange)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem(STORAGE_KEY, next) } catch { /* private mode */ }
      return next
    })
  }, [])

  return [theme, toggleTheme]
}
