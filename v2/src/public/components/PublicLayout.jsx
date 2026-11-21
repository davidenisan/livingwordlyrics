import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Moon, Search, Shuffle, Sun } from 'lucide-react'
import { useTheme } from '../../shared/theme'
import { pickRandomSongId } from '../surprise'

export default function PublicLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [theme, toggleTheme] = useTheme()
  const [shuffling, setShuffling] = useState(false)
  const isHome = location.pathname === '/'

  useEffect(() => {
    const current = new URLSearchParams(location.search).get('q') || ''
    setQuery(current)
  }, [location.search])

  // Start each new page at the top (the router does not restore scroll).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  // "/" focuses the search box, like most search-first sites.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
      const input = document.querySelector('[data-search-input]')
      if (input) {
        event.preventDefault()
        input.focus()
        input.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleSubmit = (event) => {
    event.preventDefault()
    const value = query.trim()
    navigate(value ? `/?q=${encodeURIComponent(value)}` : '/')
  }

  const surprise = async () => {
    if (shuffling) return
    setShuffling(true)
    try {
      const id = await pickRandomSongId()
      if (id) navigate(`/songs/${id}`)
    } catch {
      // Library unavailable; the page itself shows the error state.
    } finally {
      setShuffling(false)
    }
  }

  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <div className="public-layout">
      <header className="public-header">
        <nav className="glass-nav" aria-label="Main">
          <Link className="public-brand" to="/" aria-label="Living Word Lyrics home">
            <span className="brand-mark" aria-hidden="true">LW</span>
            <span className="brand-text">Living Word Lyrics</span>
          </Link>

          {!isHome && (
            <form className="public-header-search" onSubmit={handleSubmit} role="search">
              <Search size={16} />
              <input
                data-search-input
                aria-label="Search songs, lyrics, songwriters"
                placeholder="Search songs, lyrics, songwriters..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button className="btn btn-primary" type="submit">Search</button>
            </form>
          )}

          <div className="nav-actions">
            <button className="nav-icon" type="button" onClick={surprise} disabled={shuffling} title="Open a random song">
              <Shuffle size={16} />
              <span className="nav-icon-label">{shuffling ? 'Finding...' : 'Surprise me'}</span>
            </button>
            <button className="nav-icon" type="button" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </nav>
      </header>
      <main>
        <Outlet context={{ surprise, shuffling }} />
      </main>
      <footer className="public-footer">
        <p>Living Word Lyrics · Saints Community in Songs</p>
        <p>
          Privacy: we don&apos;t use accounts or tracking cookies for visitors. Song reactions use an anonymous
          session and a background bot check by Cloudflare Turnstile, which is covered by the{' '}
          <a href="https://www.cloudflare.com/turnstile-privacy-policy/" target="_blank" rel="noreferrer">Cloudflare Turnstile Privacy Addendum</a>.
          Recent searches are shown without any information about who searched.
        </p>
      </footer>
    </div>
  )
}
