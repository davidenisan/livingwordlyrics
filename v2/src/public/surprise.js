import { api } from '../api'

// Picks a random song that has lyrics. Albums and album details come from the
// API cache, so repeat clicks are instant.
export async function pickRandomSongId() {
  const albums = (await api.albums.list()).filter((album) => album.song_count > 0)
  for (let attempt = 0; attempt < 4 && albums.length; attempt += 1) {
    const album = albums[Math.floor(Math.random() * albums.length)]
    const detail = await api.albums.get(album.id)
    const songs = detail.songs.filter((song) => song.has_lyrics)
    if (songs.length) return songs[Math.floor(Math.random() * songs.length)].id
  }
  return null
}
