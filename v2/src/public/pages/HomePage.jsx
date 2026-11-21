import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useOutletContext, useSearchParams } from 'react-router-dom'
import { ArrowUpRight, Disc3, History, Link, Search, Shuffle, Youtube } from 'lucide-react'
import { api } from '../../api'
import { ALBUM_SORT_OPTIONS, sortAlbums } from '../../shared/utils/albums'
import { highlightText, searchMatchSnippet } from '../../shared/utils/lyrics'
import ScrollRow from '../components/ScrollRow'
import SectionHead from '../components/SectionHead'
import SongCard from '../components/SongCard'

const INITIAL_RESULT_COUNT = 3

export default function HomePage() {
  const { surprise, shuffling } = useOutletContext() || {}
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
  const [recentSearches, setRecentSearches] = useState([])
  const [newest, setNewest] = useState(null)

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

  // Refreshed whenever the visitor returns to the home page (q cleared).
  useEffect(() => {
    if (q) return undefined
    let cancelled = false
    api.searches.recent(12).then((list) => { if (!cancelled) setRecentSearches(list) }).catch(() => {})
    return () => { cancelled = true }
  }, [q])

  const sortedAlbums = useMemo(() => sortAlbums(albums, albumSort), [albums, albumSort])
  const newestAlbum = useMemo(() => sortAlbums(albums, 'smart_desc').find((album) => album.song_count > 0), [albums])
  const totalSongs = useMemo(() => albums.reduce((sum, album) => sum + (album.song_count || 0), 0), [albums])
  const heroCovers = useMemo(() => sortAlbums(albums, 'smart_desc').filter((album) => album.cover_url).slice(0, 6), [albums])

  useEffect(() => {
    if (!newestAlbum) return undefined
    let cancelled = false
    api.albums.get(newestAlbum.id).then((detail) => { if (!cancelled) setNewest(detail) }).catch(() => {})
    return () => { cancelled = true }
  }, [newestAlbum])

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

  const runSearch = (value) => {
    const trimmed = value.trim()
    if (!trimmed) return
    setQuery(trimmed)
    setParams({ q: trimmed })
    api.searches.log(trimmed)
  }

  const visibleResults = showAllResults ? results : results.slice(0, INITIAL_RESULT_COUNT)
  const hiddenResultCount = Math.max(0, results.length - INITIAL_RESULT_COUNT)

  return (
    <div className="public-page">
      <section className="home-hero">
        {heroCovers.length > 0 && (
          <div className="hero-art" aria-hidden="true">
            {heroCovers.map((album) => <img key={album.id} src={album.cover_url} alt="" decoding="async" />)}
          </div>
        )}
        <span className="hero-eyebrow">Saints Community in Songs</span>
        <h1>Find worship lyrics fast</h1>
        <p className="hero-sub">Songs, lyrics, and writers from the Living Word library.</p>
        <form
          className="home-search"
          onSubmit={(event) => {
            event.preventDefault()
            runSearch(query)
          }}
          role="search"
        >
          <Search size={20} />
          <input
            data-search-input
            aria-label="Search songs, lyrics, songwriters"
            placeholder="Search songs, lyrics, songwriters..."
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="btn btn-primary" type="submit">Search</button>
        </form>

        {albumsStatus === 'ready' && (
          <div className="hero-stats">
            <span className="stat-pill"><strong>{albums.length}</strong> albums</span>
            <span className="stat-pill"><strong>{totalSongs}</strong> songs</span>
            <span className="stat-pill">Press <span className="kbd">/</span> to search</span>
          </div>
        )}

        {!q && recentSearches.length > 0 && (
          <div className="recent-searches" aria-label="Recent searches">
            <span className="recent-label"><History size={13} /> People are searching</span>
            {recentSearches.map((item) => (
              <button key={item.query} type="button" className="chip" onClick={() => runSearch(item.query)} title={`Searched ${formatAgo(item.last_searched)}`}>
                {item.query}
                <small>{formatAgo(item.last_searched)}</small>
              </button>
            ))}
          </div>
        )}
      </section>

      {q && (
        <section className="public-section" aria-busy={loading}>
          <SectionHead kicker="Search" title={`Results for "${q}"`} />
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
                  <SearchResult key={song.id} song={song} query={q} onOpen={() => api.searches.log(q)} />
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
        <>
          {newest?.songs?.length > 0 && (
            <section className="public-section" aria-labelledby="newest-heading">
              <SectionHead kicker="Newest volume" title={newest.title} id="newest-heading">
                <RouterLink className="pill-link" to={`/albums/${newest.id}`}>
                  Open album <ArrowUpRight size={14} />
                </RouterLink>
              </SectionHead>
              <ScrollRow label={`Songs from ${newest.title}`}>
                {newest.songs.map((song) => (
                  <SongCard key={song.id} song={song} coverUrl={newest.cover_url} />
                ))}
              </ScrollRow>
            </section>
          )}

          {surprise && albumsStatus === 'ready' && (
            <section className="surprise-band">
              <div>
                <span className="kicker">Not sure what to sing?</span>
                <h2>Let the library pick a song</h2>
                <p>Opens a random song that has lyrics.</p>
              </div>
              <button className="btn btn-primary" type="button" onClick={surprise} disabled={shuffling}>
                <Shuffle size={15} /> {shuffling ? 'Finding a song...' : 'Surprise me'}
              </button>
            </section>
          )}

          <section className="public-section" aria-labelledby="library-heading">
            <SectionHead kicker="The library" title="All albums" id="library-heading">
              <label className="sort-control">
                <span>Sort</span>
                <select value={albumSort} onChange={(event) => setAlbumSort(event.target.value)}>
                  {ALBUM_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </SectionHead>
            {albumsStatus === 'loading' && <p style={{ color: 'var(--text-muted)' }}>Loading albums...</p>}
            {albumsStatus === 'error' && <p className="public-status-error">Albums could not be loaded. Please refresh to try again.</p>}
            <div className="card-grid">
              {sortedAlbums.map((album) => (
                <RouterLink key={album.id} className="album-card" to={`/albums/${album.id}`}>
                  <div className="album-cover">
                    {album.cover_url ? <img src={album.cover_url} alt="" loading="lazy" decoding="async" /> : <Disc3 size={36} className="album-cover-placeholder" />}
                  </div>
                  <div className="album-title">{album.title}</div>
                  <div className="album-meta">
                    {album.year && <span className="album-meta-pill">{album.year}</span>}
                    {album.song_count} song{album.song_count !== 1 ? 's' : ''}
                  </div>
                </RouterLink>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function SearchResult({ song, query, onOpen }) {
  // The search RPC returns a short excerpt; the legacy fallback returns lyrics.
  const snippet = song.lyrics_excerpt != null
    ? { segments: highlightText(song.lyrics_excerpt, query), prefix: '', suffix: '' }
    : searchMatchSnippet(song.lyrics, query)

  return (
    <RouterLink className="public-result" to={`/songs/${song.id}`} onClick={onOpen}>
      <span className="song-card-art">
        {song.album_cover_url ? <img src={song.album_cover_url} alt="" loading="lazy" decoding="async" /> : <Disc3 size={20} />}
      </span>
      <div className="public-result-body">
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

function formatAgo(timestamp) {
  const seconds = Math.max(0, (Date.now() - new Date(timestamp).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
