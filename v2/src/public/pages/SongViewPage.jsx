import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Copy, Disc, Link, Youtube } from 'lucide-react'
import { api } from '../../api'
import ProjectionOverlay from '../../shared/components/ProjectionOverlay'
import ReactionBar from '../components/ReactionBar'
import ScrollRow from '../components/ScrollRow'
import SectionHead from '../components/SectionHead'
import SongCard from '../components/SongCard'
import { htmlToPlainLyrics } from '../../shared/utils/lyrics'
import { getYouTubeEmbedUrl } from '../../shared/utils/media'
import { displayTitle } from '../../shared/utils/titles'

export default function SongViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [song, setSong] = useState(null)
  const [status, setStatus] = useState('loading')
  const [copied, setCopied] = useState(false)
  const [projectionMode, setProjectionMode] = useState(false)
  const [album, setAlbum] = useState(null)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    api.songs.get(id)
      .then((result) => {
        if (cancelled) return
        setSong(result)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // The rest of the album, starting after this track ("Up next").
  useEffect(() => {
    if (!song?.album_id) return undefined
    let cancelled = false
    api.albums.get(song.album_id).then((detail) => { if (!cancelled) setAlbum(detail) }).catch(() => {})
    return () => { cancelled = true }
  }, [song?.album_id])

  useEffect(() => {
    if (song?.title) document.title = `${displayTitle(song.title)} · Living Word Lyrics`
    return () => { document.title = 'Living Word Lyrics' }
  }, [song?.title])

  // A shared or refreshed song link has no in-app history to go back to, so
  // "Back" goes to the song's album instead of leaving the site.
  const handleBack = () => {
    if (location.key !== 'default') navigate(-1)
    else navigate(song?.album_id ? `/albums/${song.album_id}` : '/')
  }

  useEffect(() => {
    if (!projectionMode) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape' || event.key.toLowerCase() === 'p') {
        setProjectionMode(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [projectionMode])

  const handleCopyLyrics = async () => {
    if (!song?.lyrics) return
    try {
      await navigator.clipboard.writeText(htmlToPlainLyrics(song.lyrics))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard access can be blocked; leave the button unchanged.
    }
  }

  if (status === 'loading') return <div className="public-page" aria-busy="true">Loading...</div>

  if (status === 'error' || !song) {
    return (
      <div className="public-page">
        <section className="public-section">
          <h1>Song not available</h1>
          <p style={{ color: 'var(--text-muted)', margin: '8px 0 16px' }}>
            This song could not be loaded. It may have been removed, or the library is temporarily unavailable.
          </p>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>Back to all albums</button>
        </section>
      </div>
    )
  }

  const albumSongs = album?.id === song.album_id ? album.songs : []
  const position = albumSongs.findIndex((item) => item.id === song.id)
  const upNext = position === -1 ? [] : [...albumSongs.slice(position + 1), ...albumSongs.slice(0, position)]

  const youtubeEmbedUrl = getYouTubeEmbedUrl(song.youtube_url)
  const embedKey = `${song.id}-${youtubeEmbedUrl || 'none'}`

  return (
    <div className="public-page">
      <section className="public-section">
        <button className="btn btn-ghost" onClick={handleBack}>
          <ChevronLeft size={14} /> Back
        </button>

        <div className="song-detail-header" style={{ marginTop: 16 }}>
          <div className="song-title-with-cover">
            <div className="song-album-cover">
              {song.album_cover_url ? <img src={song.album_cover_url} alt={`${displayTitle(song.album_title)} cover`} /> : <Disc size={24} />}
            </div>
            <div>
            <h1 style={{ fontSize: 32 }}>{displayTitle(song.title)}</h1>
            <p className="search-result-album">{displayTitle(song.album_title)}</p>
            {song.songwriters && <p className="songwriters-meta">Words &amp; Music: {song.songwriters}</p>}

            <div className="song-links">
              {song.youtube_url && (
                <a href={song.youtube_url} target="_blank" rel="noreferrer" className="link-btn link-btn-yt">
                  <Youtube size={13} /> YouTube
                </a>
              )}
              {song.lwm_url && (
                <a href={song.lwm_url} target="_blank" rel="noreferrer" className="link-btn link-btn-lwm">
                  <Link size={13} /> Living Word Media
                </a>
              )}
            </div>
            <ReactionBar songId={song.id} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-secondary" onClick={handleCopyLyrics} disabled={!song.lyrics}>
              <Copy size={14} /> {copied ? 'Copied' : 'Copy lyrics'}
            </button>
            <button className="btn btn-primary" onClick={() => setProjectionMode(true)}>
              Projection mode
            </button>
          </div>
        </div>

        <div className={`song-content-grid ${youtubeEmbedUrl ? 'has-embed' : ''}`}>
          <div>
            {song.lyrics ? (
              <div className="lyrics-view" dangerouslySetInnerHTML={{ __html: song.lyrics }} />
            ) : (
              <div className="lyrics-view"><span className="lyrics-empty">No lyrics available.</span></div>
            )}
          </div>

          {youtubeEmbedUrl && (
            <div className="song-embed-card">
              <div className="song-embed-title">Watch on YouTube</div>
              <div className="song-embed-frame-wrap">
                <iframe
                  key={embedKey}
                  src={youtubeEmbedUrl}
                  title={`${displayTitle(song.title)} video`}
                  className="song-embed-frame"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {upNext.length > 0 && (
        <section className="public-section" aria-labelledby="up-next-heading">
          <SectionHead kicker="Up next" title={`More from ${displayTitle(album.title)}`} id="up-next-heading" />
          <ScrollRow label={`More songs from ${displayTitle(album.title)}`}>
            {upNext.map((item) => (
              <SongCard key={item.id} song={item} coverUrl={album.cover_url} />
            ))}
          </ScrollRow>
        </section>
      )}

      {projectionMode && <ProjectionOverlay html={song.lyrics} onClose={() => setProjectionMode(false)} />}
    </div>
  )
}
