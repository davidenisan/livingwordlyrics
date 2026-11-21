import { configurationError, db, getSupabase } from '../supabase'
import { hasUsableLyrics } from '../shared/utils/lyrics'

const assertConfigured = () => { if (configurationError) throw new Error(configurationError) }
const unwrap = ({ data, error }) => { if (error) throw new Error(error.message); return data }
const nullable = (value) => (value === '' || value === undefined ? null : value)
const normalizeSong = (song) => ({ ...song, album_title: song.albums?.title, album_cover_url: song.albums?.cover_url, albums: undefined })
const sortTracks = (songs = []) => [...songs].sort((a, b) => (a.track_number ?? Infinity) - (b.track_number ?? Infinity) || a.title.localeCompare(b.title))

// Explicit column lists keep lyric bodies out of every list/search response.
const ALBUM_COLUMNS = 'id, title, year, description, cover_url, created_at'
const SONG_LIST_COLUMNS = 'id, album_id, track_number, title, songwriters, youtube_url, lwm_url, created_at'
const SONG_DETAIL_COLUMNS = `${SONG_LIST_COLUMNS}, lyrics`
export const SEARCH_RESULT_LIMIT = 50

// ---------------------------------------------------------------------------
// Cache: stable public data (albums, album detail, song detail) is kept for a
// few minutes and concurrent identical requests share one network call. Any
// admin write clears it so editors always see their own changes.
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map()

function cached(key, load) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise
  const promise = load().catch((error) => {
    if (cache.get(key)?.promise === promise) cache.delete(key)
    throw error
  })
  cache.set(key, { at: Date.now(), promise })
  return promise
}

const invalidateCache = () => cache.clear()

// ---------------------------------------------------------------------------
// Migration 002 adds a `has_lyrics` computed column and a `search_songs` RPC.
// Until it is applied, fall back to the original queries (which download lyric
// bodies) so a deploy never depends on the migration having run first.
// ---------------------------------------------------------------------------
let slimQueriesAvailable = true
const MISSING_FEATURE_CODES = new Set(['42703', '42883', 'PGRST202', 'PGRST200', 'PGRST204'])

async function withLegacyFallback(slim, legacy) {
  if (slimQueriesAvailable) {
    const { data, error } = await slim()
    if (!error) return data
    if (!MISSING_FEATURE_CODES.has(error.code)) throw new Error(error.message)
    slimQueriesAvailable = false
    console.info('[api] Migration 002 not applied yet; using legacy queries.')
  }
  return unwrap(await legacy())
}

function withLyricsFlag(song) {
  const { lyrics, ...rest } = song
  return { ...rest, has_lyrics: hasUsableLyrics(lyrics) }
}

// Admin checks and writes use the full (lazily loaded) client so requests carry
// the signed-in user's session; RLS + is_lyrics_admin() still guard every write.
async function currentAdmin() {
  const supabase = await getSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Unauthorized')
  if (!unwrap(await supabase.rpc('is_lyrics_admin'))) throw new Error('Unauthorized')
  return { user: session.user, supabase }
}

async function adminWrite(run) {
  const { supabase } = await currentAdmin()
  try {
    return await run(supabase)
  } finally {
    invalidateCache()
  }
}

function listAlbums() {
  return cached('albums', async () => {
    assertConfigured()
    const albums = unwrap(await db.from('albums').select(`${ALBUM_COLUMNS}, songs(count)`))
    return albums.map((album) => ({ ...album, song_count: album.songs?.[0]?.count || 0, songs: undefined }))
  })
}

// Escape a value for use inside a PostgREST or() filter: double-quote it so
// commas/parentheses in the search text cannot break the filter syntax, and
// escape LIKE wildcards so they match literally.
function ilikeValue(value) {
  const escaped = value.replace(/[\\%_]/g, '\\$&').replace(/"/g, '\\"')
  return `"%${escaped}%"`
}

export const api = {
  auth: {
    async login({ username, password }) {
      const supabase = await getSupabase()
      const { data, error } = await supabase.auth.signInWithPassword({ email: username.trim(), password })
      if (error) throw new Error(error.message)
      if (!unwrap(await supabase.rpc('is_lyrics_admin'))) { await supabase.auth.signOut(); throw new Error('This account is not an admin.') }
      return { user: { username: data.user.email } }
    },
    async logout() { const supabase = await getSupabase(); unwrap(await supabase.auth.signOut()); return { success: true } },
    async me() { const { user } = await currentAdmin(); return { user: { username: user.email } } },
  },
  albums: {
    list: listAlbums,
    get(id) {
      return cached(`album:${id}`, async () => {
        assertConfigured()
        const album = await withLegacyFallback(
          () => db.from('albums').select(`${ALBUM_COLUMNS}, songs(${SONG_LIST_COLUMNS}, has_lyrics)`).eq('id', id).single(),
          async () => {
            const result = await db.from('albums').select(`${ALBUM_COLUMNS}, songs(${SONG_DETAIL_COLUMNS})`).eq('id', id).single()
            return result.error ? result : { data: { ...result.data, songs: (result.data.songs || []).map(withLyricsFlag) } }
          },
        )
        return { ...album, songs: sortTracks(album.songs) }
      })
    },
    create(form) { return adminWrite(async (supabase) => unwrap(await supabase.from('albums').insert({ ...form, year: nullable(form.year) }).select().single())) },
    update(id, form) { return adminWrite(async (supabase) => unwrap(await supabase.from('albums').update({ ...form, year: nullable(form.year) }).eq('id', id).select().single())) },
    delete(id) { return adminWrite(async (supabase) => { unwrap(await supabase.from('albums').delete().eq('id', id)); return { success: true } }) },
    importDocx(albumId, { fileBase64, filename }) {
      return adminWrite(async (supabase) => {
        const { parseSongsFromDocx, fileFromBase64 } = await import('./docx')
        const songs = await parseSongsFromDocx(fileFromBase64(fileBase64, filename))
        if (!songs.length) throw new Error('No songs found in DOCX. Use Heading 1 or Heading 2 for song titles.')
        const existing = unwrap(await supabase.from('songs').select('track_number').eq('album_id', albumId))
        let nextTrack = Math.max(0, ...existing.map((song) => Number(song.track_number) || 0)) + 1
        const rows = songs.map((song) => ({ ...song, album_id: Number(albumId), track_number: song.track_number || nextTrack++ }))
        unwrap(await supabase.from('songs').insert(rows))
        return { success: true, imported: rows.length, songs: rows }
      })
    },
    applyLwmUrl(albumId, { lwm_url, onlyMissing = true }) {
      return adminWrite(async (supabase) => {
        let query = supabase.from('songs').select('id').eq('album_id', albumId)
        if (onlyMissing) query = query.or('lwm_url.is.null,lwm_url.eq.')
        const rows = unwrap(await query)
        if (rows.length) unwrap(await supabase.from('songs').update({ lwm_url }).in('id', rows.map((row) => row.id)))
        return { success: true, updated: rows.length, onlyMissing, lwm_url }
      })
    },
  },
  songs: {
    // Returns { songs, total }. Each song has `has_lyrics` and, when the
    // migration is applied, a short plain-text `lyrics_excerpt` around the
    // match — never the full lyric body.
    async search(q, { limit = SEARCH_RESULT_LIMIT } = {}) {
      assertConfigured()
      const value = String(q || '').trim()
      if (!value) return { songs: [], total: 0 }

      if (slimQueriesAvailable) {
        const { data, error } = await db.rpc('search_songs', { search_query: value, result_limit: limit })
        if (!error) return { songs: data, total: data[0]?.total_count ?? 0 }
        if (!MISSING_FEATURE_CODES.has(error.code)) throw new Error(error.message)
        slimQueriesAvailable = false
      }

      const pattern = ilikeValue(value)
      const { data: rows, count, error } = await db
        .from('songs')
        .select(`${SONG_DETAIL_COLUMNS}, albums(title, cover_url)`, { count: 'exact' })
        .or(`title.ilike.${pattern},lyrics.ilike.${pattern},songwriters.ilike.${pattern}`)
        .order('title')
        .limit(limit)
      if (error) throw new Error(error.message)
      // Legacy path keeps `lyrics` so the client can still build a snippet.
      return { songs: rows.map((row) => ({ ...normalizeSong(row), has_lyrics: hasUsableLyrics(row.lyrics) })), total: count ?? rows.length }
    },
    get(id) {
      return cached(`song:${id}`, async () => {
        assertConfigured()
        return normalizeSong(unwrap(await db.from('songs').select(`${SONG_DETAIL_COLUMNS}, albums(title, cover_url)`).eq('id', id).single()))
      })
    },
    create(albumId, form) { return adminWrite(async (supabase) => unwrap(await supabase.from('songs').insert({ ...form, album_id: Number(albumId), track_number: nullable(form.track_number), lyrics: nullable(form.lyrics) }).select().single())) },
    update(id, form) { return adminWrite(async (supabase) => unwrap(await supabase.from('songs').update({ ...form, track_number: nullable(form.track_number), lyrics: nullable(form.lyrics) }).eq('id', id).select().single())) },
    delete(id) { return adminWrite(async (supabase) => { unwrap(await supabase.from('songs').delete().eq('id', id)); return { success: true } }) },
  },
  stats: {
    async summary() {
      await currentAdmin()
      const [albums, songs] = await Promise.all([
        listAlbums(),
        withLegacyFallback(
          () => db.from('songs').select(`${SONG_LIST_COLUMNS}, has_lyrics, albums(title)`).order('created_at', { ascending: false }),
          async () => {
            const result = await db.from('songs').select(`${SONG_DETAIL_COLUMNS}, albums(title)`).order('created_at', { ascending: false })
            return result.error ? result : { data: result.data.map(withLyricsFlag) }
          },
        ),
      ])
      const usable = songs.filter((song) => song.has_lyrics)
      return { totalAlbums: albums.length, totalSongs: songs.length, songsWithLyrics: usable.length, missingLyrics: songs.length - usable.length, lyricCoveragePercent: songs.length ? Math.round((usable.length / songs.length) * 100) : 0, songsWithYouTube: songs.filter((song) => song.youtube_url?.trim()).length, songsWithLwm: songs.filter((song) => song.lwm_url?.trim()).length, songsWithSongwriters: songs.filter((song) => song.songwriters?.trim()).length, albumsWithoutSongs: albums.filter((album) => !album.song_count).length, largestAlbum: [...albums].sort((a,b) => b.song_count - a.song_count)[0], recentlyAddedSongs: songs.slice(0,5).map((song) => ({ id: song.id, albumId: song.album_id, title: song.title, albumTitle: song.albums?.title, hasLyrics: song.has_lyrics, createdAt: song.created_at })) }
    },
    async analytics() { await currentAdmin(); return { configured: false, message: 'Google Analytics is not configured in v2 yet.' } },
  },
}
