import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Disc, Link, Youtube } from 'lucide-react'
import { api } from '../../api'
import { displayTitle } from '../../shared/utils/titles'

const SONG_SORT_OPTIONS = [
  { value: 'title_asc', label: 'A–Z' },
  { value: 'title_desc', label: 'Z–A' },
  { value: 'track', label: 'Track order' },
]

const compareTitles = (a, b) => String(a.title).localeCompare(String(b.title), undefined, { numeric: true, sensitivity: 'base' })
const compareTracks = (a, b) => (a.track_number ?? Infinity) - (b.track_number ?? Infinity) || compareTitles(a, b)

export default function AlbumViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [album, setAlbum] = useState(null)
  const [status, setStatus] = useState('loading')

  // Alphabetical by default; the choice lives in the URL (?sort=) so it is
  // kept on refresh and when the link is shared.
  const sort = SONG_SORT_OPTIONS.some((option) => option.value === params.get('sort')) ? params.get('sort') : 'title_asc'
  const sortedSongs = useMemo(() => {
    const songs = [...(album?.songs || [])]
    if (sort === 'track') return songs.sort(compareTracks)
    songs.sort(compareTitles)
    return sort === 'title_desc' ? songs.reverse() : songs
  }, [album, sort])

  const changeSort = (value) => {
    const next = new URLSearchParams(params)
    if (value === 'title_asc') next.delete('sort')
    else next.set('sort', value)
    setParams(next, { replace: true })
  }

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    api.albums.get(id)
      .then((result) => {
        if (cancelled) return
        setAlbum(result)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (album?.title) document.title = `${displayTitle(album.title)} · Living Word Lyrics`
    return () => { document.title = 'Living Word Lyrics' }
  }, [album?.title])

  if (status === 'loading') return <div className="public-page" aria-busy="true">Loading...</div>

  if (status === 'error' || !album) {
    return (
      <div className="public-page">
        <section className="public-section">
          <h1>Album not available</h1>
          <p style={{ color: 'var(--text-muted)', margin: '8px 0 16px' }}>
            This album could not be loaded. It may have been removed, or the library is temporarily unavailable.
          </p>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>Back to all albums</button>
        </section>
      </div>
    )
  }

  return (
    <div className="public-page">
      <section className="public-section">
        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          <ChevronLeft size={14} /> Home
        </button>
        <div className="album-view-header">
          <div className="album-view-cover">
            {album.cover_url ? <img src={album.cover_url} alt={`${displayTitle(album.title)} cover`} /> : <Disc size={36} />}
          </div>
          <div>
            <h1 style={{ marginTop: 10 }}>{displayTitle(album.title)}</h1>
            {album.description && <p style={{ color: 'var(--text-muted)' }}>{album.description}</p>}
          </div>
        </div>

        {album.songs?.length > 0 && (
          <div className="section-heading-row album-songs-toolbar">
            <span className="album-song-count">{album.songs.length} song{album.songs.length !== 1 ? 's' : ''}</span>
            <label className="sort-control">
              <span>Sort</span>
              <select value={sort} onChange={(event) => changeSort(event.target.value)}>
                {SONG_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="card">
          {album.songs?.length ? (
            <ul className="song-list">
              {sortedSongs.map((song) => (
                <li key={song.id}>
                  <RouterLink className="song-item" to={`/songs/${song.id}`}>
                    <span className="song-track">{song.track_number ?? '—'}</span>
                    <div style={{ flex: 1 }}>
                      <div className="song-title">{displayTitle(song.title)}</div>
                      {song.songwriters && <div className="search-result-meta">Words &amp; Music: {song.songwriters}</div>}
                    </div>
                    <div className="song-badges">
                      {song.has_lyrics
                        ? <span className="badge badge-lyrics">lyrics</span>
                        : <span className="badge badge-no-lyrics">No lyrics yet</span>}
                      {song.youtube_url && <span className="badge badge-yt" aria-label="Has YouTube video"><Youtube size={10} /></span>}
                      {song.lwm_url && <span className="badge badge-lwm" aria-label="Has Living Word Media link"><Link size={10} /></span>}
                    </div>
                  </RouterLink>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: 'var(--text-muted)', padding: '16px 20px' }}>No songs in this album yet.</p>
          )}
        </div>
      </section>
    </div>
  )
}
