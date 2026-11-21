import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { Link, Search, Youtube } from 'lucide-react'
import { api } from '../../api'
import { ALBUM_SORT_OPTIONS, sortAlbums } from '../../shared/utils/albums'
import { highlightText, searchMatchSnippet } from '../../shared/utils/lyrics'

const INITIAL_RESULT_COUNT = 3

export default function HomePage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''

  const [query, setQuery] = useState(q)
  const [results, setResults] = useState([])
  const [totalResults, setTotalResults] = useState(0)
  const [searchError, setSearchError] = useState('')
  const [albums, setAlbums] = useState([])
  const [albumsStatus, setAlbumsStatus] = useState('loading')
  const [albumSort, setAlbumSort] = useState('smart_desc')
  const [loading, setLoading] = useState(false)
  const [showAllResults, setShowAllResults] = useState(false)

  // Albums are fetched once (and cached by the API layer); sorting is local.
  useEffect(() => {
    let cancelled = false
    api.albums.list()
      .then((list) => {
        if (cancelled) return
        setAlbums(list)
        setAlbumsStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setAlbumsStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const sortedAlbums = useMemo(() => sortAlbums(albums, albumSort), [albums, albumSort])

  useEffect(() => {
    setQuery((current) => (current.trim() === q ? current : q))
    setShowAllResults(false)
  }, [q])

  useEffect(() => {
    const value = query.trim()

    if (!value) {
      const timeout = setTimeout(() => {
        if (q) setParams({}, { replace: true })
      }, 180)
      return () => clearTimeout(timeout)
    }

    if (!shouldSearch(value, query)) return undefined

    const timeout = setTimeout(() => {
      if (value !== q) setParams({ q: value }, { replace: Boolean(q) })
    }, query.endsWith(' ') ? 0 : 260)

    return () => clearTimeout(timeout)
  }, [query, q, setParams])

  useEffect(() => {
    if (!q) {
      setResults([])
      setTotalResults(0)
      setSearchError('')
      setLoading(false)
      return
    }

    // `cancelled` drops responses for queries the user has already moved past.
    let cancelled = false
    setLoading(true)
    setSearchError('')
    api.songs.search(q)
      .then(({ songs, total }) => {
        if (cancelled) return
        setResults(songs)
        setTotalResults(total)
      })
      .catch(() => {
        if (cancelled) return
        setResults([])
        setTotalResults(0)
        setSearchError('Search is unavailable right now. Please try again in a moment.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [q])

  const visibleResults = showAllResults ? results : results.slice(0, INITIAL_RESULT_COUNT)
  const hiddenResultCount = Math.max(0, results.length - INITIAL_RESULT_COUNT)

  return (
    <div className="public-page">
      <section className="search-hero">
        <h1>Find Worship Lyrics Fast</h1>
        <form
          className="home-search"
          onSubmit={(event) => {
            event.preventDefault()
            const value = query.trim()
            if (value) setParams({ q: value })
          }}
          role="search"
        >
          <Search size={20} />
          <input
            aria-label="Search songs, lyrics, songwriters"
            placeholder="Search songs, lyrics, songwriters..."
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="btn btn-primary" type="submit">Search</button>
        </form>
        <p>Songs, lyrics, and writers from the Living Word library.</p>
      </section>

      {q && (
        <section className="public-section" aria-busy={loading}>
          <h2>Results for "{q}"</h2>
          <div aria-live="polite">
            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Searching...</p>
            ) : searchError ? (
              <p className="public-status-error">{searchError}</p>
            ) : results.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No songs found. Try a shorter phrase or a different word.</p>
            ) : (
              <div className="public-results">
                {visibleResults.map((song) => (
                  <SearchResult key={song.id} song={song} query={q} />
                ))}
                {!showAllResults && hiddenResultCount > 0 && (
                  <button className="btn btn-secondary public-show-more" type="button" onClick={() => setShowAllResults(true)}>
                    Show {hiddenResultCount} more
                  </button>
                )}
                {showAllResults && totalResults > results.length && (
                  <p className="public-result-meta">
                    Showing the first {results.length} of {totalResults} matches. Add another word to narrow the results.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {!q && (
        <section className="public-section">
          <div className="section-heading-row">
            <h2>Albums</h2>
            <label className="sort-control">
              <span>Sort</span>
              <select value={albumSort} onChange={(event) => setAlbumSort(event.target.value)}>
                {ALBUM_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          {albumsStatus === 'loading' && <p style={{ color: 'var(--text-muted)' }}>Loading albums...</p>}
          {albumsStatus === 'error' && <p className="public-status-error">Albums could not be loaded. Please refresh to try again.</p>}
          <div className="card-grid">
            {sortedAlbums.map((album) => (
              <RouterLink key={album.id} className="album-card" to={`/albums/${album.id}`}>
                <div className="album-cover">
                  {album.cover_url ? <img src={album.cover_url} alt="" loading="lazy" decoding="async" /> : <span className="album-cover-placeholder">Album</span>}
                </div>
                <div className="album-title">{album.title}</div>
                <div className="album-meta">{album.song_count} song{album.song_count !== 1 ? 's' : ''}</div>
              </RouterLink>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function SearchResult({ song, query }) {
  // The search RPC returns a short excerpt; the legacy fallback returns lyrics.
  const snippet = song.lyrics_excerpt != null
    ? { segments: highlightText(song.lyrics_excerpt, query), prefix: '', suffix: '' }
    : searchMatchSnippet(song.lyrics, query)

  return (
    <RouterLink className="public-result" to={`/songs/${song.id}`}>
      <h3>{renderHighlighted(song.title, query)}</h3>
      <p className="public-result-meta">{song.album_title}</p>
      {song.songwriters && (
        <p className="public-result-meta">Words &amp; Music: {renderHighlighted(song.songwriters, query)}</p>
      )}
      {snippet.segments.length > 0 && (
        <p className="public-result-snippet">
          <span className="public-result-snippet-label">Lyrics: </span>
          {snippet.prefix}
          {snippet.segments.map((segment, index) => (
            <span key={`${segment.text}-${index}`} className={segment.match ? 'search-highlight' : undefined}>
              {segment.text}
            </span>
          ))}
          {snippet.suffix}
        </p>
      )}
      <div className="song-badges" style={{ marginTop: 8 }}>
        {song.has_lyrics
          ? <span className="badge badge-lyrics">lyrics</span>
          : <span className="badge badge-no-lyrics">No lyrics yet</span>}
        {song.youtube_url && <span className="badge badge-yt"><Youtube size={10} /></span>}
        {song.lwm_url && <span className="badge badge-lwm"><Link size={10} /></span>}
      </div>
    </RouterLink>
  )
}

function renderHighlighted(value, query) {
  return highlightText(value, query).map((segment, index) => (
    <span key={`${segment.text}-${index}`} className={segment.match ? 'search-highlight' : undefined}>
      {segment.text}
    </span>
  ))
}

function shouldSearch(value, rawValue) {
  return value.length >= 2 || /\S+\s$/.test(rawValue)
}
