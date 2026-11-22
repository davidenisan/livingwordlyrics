// Copies album covers into the public "album-covers" Supabase Storage bucket,
// resized to at most 800 px and saved as JPEG with the right content type, then
// points each album's cover_url at the copy. Dry run by default; pass --apply.
//
//   node scripts/rehost-album-covers.mjs [--album <id>] [--apply]
//
// Why: covers hosted elsewhere broke in some browsers (an S3 file served as
// audio/mpeg doesn't render in Safari) or loaded slowly (raw.githubusercontent.com
// is throttled, and some originals were 3000+ px). Albums already pointing at the
// bucket are skipped, so it's safe to re-run after adding new albums.
// Needs macOS `sips` for resizing. Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'album-covers';
const MAX_SIZE = 800;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const albumIndex = args.indexOf('--album');
const onlyAlbum = albumIndex === -1 ? null : Number(args[albumIndex + 1]);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const bucketPrefix = `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

let query = supabase.from('albums').select('id,title,cover_url').not('cover_url', 'is', null).order('id');
if (onlyAlbum) query = query.eq('id', onlyAlbum);
const { data: albums, error } = await query;
if (error) throw new Error(error.message);

const todo = albums.filter((album) => album.cover_url.trim() && !album.cover_url.startsWith(bucketPrefix));
console.log(`${albums.length} album(s) with a cover, ${todo.length} not yet in the ${BUCKET} bucket.`);
if (!todo.length) process.exit(0);

if (apply) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((bucket) => bucket.name === BUCKET)) {
    const { error: bucketError } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      fileSizeLimit: '5MB',
    });
    if (bucketError) throw new Error(`Creating bucket: ${bucketError.message}`);
    console.log(`Created public bucket "${BUCKET}".`);
  }
}

const work = await mkdtemp(path.join(tmpdir(), 'album-covers-'));
try {
  for (const album of todo) {
    const response = await fetch(album.cover_url);
    if (!response.ok) { console.log(`  FAIL  #${album.id} ${album.title}: ${response.status} from ${album.cover_url}`); continue; }
    const original = Buffer.from(await response.arrayBuffer());
    const source = path.join(work, `source-${album.id}`);
    const output = path.join(work, `album-${album.id}.jpg`);
    await writeFile(source, original);
    // -Z only ever shrinks; smaller originals keep their size.
    execFileSync('sips', ['-Z', String(MAX_SIZE), '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', source, '--out', output], { stdio: 'ignore' });
    const jpeg = await readFile(output);
    // Content hash in the name, so a replaced cover never shows a cached old one.
    const name = `album-${album.id}-${createHash('sha1').update(jpeg).digest('hex').slice(0, 8)}.jpg`;
    const sizes = `${(original.length / 1024).toFixed(0)} KB -> ${(jpeg.length / 1024).toFixed(0)} KB`;

    if (!apply) { console.log(`  would copy  #${album.id} ${album.title} (${sizes})`); continue; }

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(name, jpeg, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: true,
    });
    if (uploadError) throw new Error(`#${album.id} upload: ${uploadError.message}`);
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(name);
    const { error: updateError } = await supabase.from('albums').update({ cover_url: publicUrl }).eq('id', album.id);
    if (updateError) throw new Error(`#${album.id} update: ${updateError.message}`);
    console.log(`  copied  #${album.id} ${album.title} (${sizes})\n          was ${album.cover_url}`);
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
console.log(apply ? 'Done.' : 'Dry run: add --apply to upload and update cover_url.');
