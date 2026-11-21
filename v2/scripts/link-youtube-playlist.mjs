// Links every song in an album to its video in a YouTube playlist, matching by
// title. Dry run by default; pass --apply to write.
//
//   node scripts/link-youtube-playlist.mjs --album "Charis Camp Meeting in Songs" \
//     --playlist "https://youtube.com/playlist?list=PL..." [--apply] [--overwrite]
//
// Only songs without a YouTube link are updated unless --overwrite is given.
// Songs and videos that don't match exactly are listed, never guessed.
// Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env (local only).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const apply = args.includes('--apply');
const overwrite = args.includes('--overwrite');
const albumQuery = option('--album');
const playlistUrl = option('--playlist');

if (!albumQuery || !playlistUrl) {
  console.error('Usage: node scripts/link-youtube-playlist.mjs --album "<album title or id>" --playlist <url> [--apply] [--overwrite]');
  process.exit(1);
}

const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);

const listId = new URL(playlistUrl).searchParams.get('list');
if (!listId) throw new Error('The playlist URL has no list= parameter.');

// --- Read the playlist's videos from the public playlist page --------------
async function readPlaylist(id) {
  const response = await fetch(`https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' },
  });
  if (!response.ok) throw new Error(`YouTube returned ${response.status} for the playlist.`);
  const html = await response.text();
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!match) throw new Error('Could not find playlist data on the page (YouTube may have changed its layout).');
  const data = JSON.parse(match[1]);

  const videos = [];
  const seen = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    // Current layout (lockupViewModel) and the older playlistVideoRenderer.
    const lockup = node.lockupViewModel;
    if (lockup?.contentId && lockup.contentType !== 'LOCKUP_CONTENT_TYPE_PLAYLIST') {
      const title = lockup.metadata?.lockupMetadataViewModel?.title?.content;
      if (title && !seen.has(lockup.contentId)) { seen.add(lockup.contentId); videos.push({ id: lockup.contentId, title }) }
    }
    const renderer = node.playlistVideoRenderer;
    if (renderer?.videoId) {
      const title = renderer.title?.runs?.map((run) => run.text).join('') || renderer.title?.simpleText;
      if (title && !seen.has(renderer.videoId)) { seen.add(renderer.videoId); videos.push({ id: renderer.videoId, title }) }
    }
    Object.values(node).forEach(walk);
  };
  walk(data);
  const playlistTitle = data.metadata?.playlistMetadataRenderer?.title || '(untitled playlist)';
  return { playlistTitle, videos };
}

const normalize = (value = '') => value
  .normalize('NFKD')
  .replace(/[‘’]/g, "'")
  .toLowerCase()
  .replace(/[^a-z0-9' ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const videoIdFrom = (url = '') => {
  const found = String(url).match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([\w-]{11})/);
  return found ? found[1] : null;
};

// --- Load the album ---------------------------------------------------------
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const albumFilter = /^\d+$/.test(albumQuery) ? ['id', Number(albumQuery)] : ['title', albumQuery];
const { data: albums, error } = await supabase
  .from('albums')
  .select('id,title,songs(id,track_number,title,youtube_url)')
  .eq(...albumFilter);
if (error) throw new Error(error.message);
if (albums.length !== 1) throw new Error(`Expected exactly one album for "${albumQuery}", found ${albums.length}.`);
const album = albums[0];

const { playlistTitle, videos } = await readPlaylist(listId);
console.log(`Album:    ${album.title} (${album.songs.length} songs)`);
console.log(`Playlist: ${playlistTitle} (${videos.length} videos)`);
if (videos.length < album.songs.length) {
  console.log('Note: the playlist has fewer videos than the album has songs; only the first page of a very long playlist is read.');
}

// --- Match by normalised title ---------------------------------------------
const songsByTitle = new Map();
for (const song of album.songs) {
  const key = normalize(song.title);
  songsByTitle.set(key, [...(songsByTitle.get(key) || []), song]);
}

const updates = [];
const unchanged = [];
const conflicts = [];
const unmatchedVideos = [];
const matchedSongIds = new Set();

for (const video of videos) {
  const candidates = (songsByTitle.get(normalize(video.title)) || []).filter((song) => !matchedSongIds.has(song.id));
  if (candidates.length !== 1) {
    unmatchedVideos.push(`${video.title} (${candidates.length ? 'ambiguous' : 'no song with this title'})`);
    continue;
  }
  const song = candidates[0];
  matchedSongIds.add(song.id);
  const url = `https://www.youtube.com/watch?v=${video.id}`;
  const currentId = videoIdFrom(song.youtube_url);
  if (currentId === video.id) unchanged.push(song);
  else if (song.youtube_url && !overwrite) conflicts.push({ song, url });
  else updates.push({ song, url });
}

const unmatchedSongs = album.songs.filter((song) => !matchedSongIds.has(song.id));

const byTrack = (a, b) => (a.song?.track_number ?? a.track_number ?? 0) - (b.song?.track_number ?? b.track_number ?? 0);
for (const { song, url } of updates.sort(byTrack)) console.log(`  ${apply ? 'set' : 'would set'}  #${song.track_number ?? '-'} ${song.title} -> ${url}`);
if (unchanged.length) console.log(`Already linked to the same video: ${unchanged.length}`);
if (conflicts.length) {
  console.log('Has a different YouTube link (kept; rerun with --overwrite to replace):');
  for (const { song, url } of conflicts.sort(byTrack)) console.log(`  #${song.track_number ?? '-'} ${song.title}: ${song.youtube_url} (playlist: ${url})`);
}
if (unmatchedVideos.length) console.log(`Videos not matched:\n  ${unmatchedVideos.join('\n  ')}`);
if (unmatchedSongs.length) console.log(`Songs not matched:\n  ${unmatchedSongs.map((song) => `#${song.track_number ?? '-'} ${song.title}`).join('\n  ')}`);

if (apply) {
  for (const { song, url } of updates) {
    const { error: updateError } = await supabase.from('songs').update({ youtube_url: url }).eq('id', song.id);
    if (updateError) throw new Error(`${song.title}: ${updateError.message}`);
  }
}

console.log(`${apply ? 'Updated' : 'Would update'} ${updates.length} song(s).${apply ? '' : ' Dry run: add --apply to write.'}`);
