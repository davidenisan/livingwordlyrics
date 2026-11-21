import { Link as RouterLink } from 'react-router-dom'
import { Disc3, Link, Youtube } from 'lucide-react'
import { displayTitle } from '../../shared/utils/titles'

export default function SongCard({ song, coverUrl, meta }) {
  return (
    <RouterLink className="song-card" to={`/songs/${song.id}`} role="listitem">
      <span className="song-card-art">
        {coverUrl ? <img src={coverUrl} alt="" loading="lazy" decoding="async" /> : <Disc3 size={22} />}
        {song.track_number != null && <span className="song-card-track">{song.track_number}</span>}
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="song-card-title" style={{ display: 'block' }}>{displayTitle(song.title)}</span>
        <span className="song-card-meta" style={{ display: 'block' }}>{meta ?? (song.songwriters || 'Saints Community')}</span>
        <span className="song-badges">
          {song.has_lyrics
            ? <span className="badge badge-lyrics">lyrics</span>
            : <span className="badge badge-no-lyrics">No lyrics yet</span>}
          {song.youtube_url && <span className="badge badge-yt" aria-label="Has YouTube video"><Youtube size={10} /></span>}
          {song.lwm_url && <span className="badge badge-lwm" aria-label="Has Living Word Media link"><Link size={10} /></span>}
        </span>
      </span>
    </RouterLink>
  )
}
