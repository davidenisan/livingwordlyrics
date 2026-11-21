-- Living Word Lyrics v2 — slim public queries
-- Apply in the Supabase SQL Editor after 001_initial_schema.sql.
--
-- Lets list and search screens show "has lyrics" badges and a short excerpt
-- without downloading full lyric bodies. Both functions run as the caller
-- (security invoker), so the existing RLS policies on albums/songs still apply.
-- The frontend falls back to its older queries until this has been applied.

-- Lyrics HTML -> single-line plain text: tags removed, common entities decoded
-- (stored lyrics use &#x27; for apostrophes, so "you're" must match), curly
-- apostrophes straightened, and whitespace collapsed.
create or replace function public.lyrics_plain_text(html text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    translate(replace(replace(replace(replace(replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(html, ''), '<br\s*/?>|</(p|h[1-6]|blockquote|li)>', ' ', 'gi'),
          '<[^>]+>', '', 'g'
        ),
        '&(#x27|#39|apos);', '''', 'gi'
      ),
      '&quot;', '"'), '&lt;', '<'), '&gt;', '>'), '&nbsp;', ' '), '&amp;', '&'), '‘’', ''''''),
    '\s+', ' ', 'g'
  ));
$$;

-- Computed column: select it as `has_lyrics` on songs (including embeds such
-- as albums?select=songs(id,has_lyrics)). Mirrors hasUsableLyrics() in
-- src/shared/utils/lyrics.js.
create or replace function public.has_lyrics(song public.songs)
returns boolean
language sql
stable
set search_path = ''
as $$
  select plain <> ''
     and position('no lyrics yet' in plain) = 0
     and position('no lyrics for this yet' in plain) = 0
  from (select lower(public.lyrics_plain_text(song.lyrics)) as plain) as t;
$$;

-- Public search. Matches title, songwriters, or plain-text lyrics (so phrases
-- that span line breaks still match). Title matches rank first, then
-- songwriter matches, then alphabetical. Returns a ~180 character excerpt
-- around the first lyric match and the total number of matches.
create or replace function public.search_songs(search_query text, result_limit integer default 50)
returns table (
  id bigint,
  album_id bigint,
  track_number integer,
  title text,
  songwriters text,
  youtube_url text,
  lwm_url text,
  album_title text,
  album_cover_url text,
  has_lyrics boolean,
  lyrics_excerpt text,
  total_count bigint
)
language sql
stable
set search_path = ''
as $$
  with params as (
    select
      btrim(translate(coalesce(search_query, ''), '‘’', '''''')) as q,
      least(greatest(coalesce(result_limit, 50), 1), 100) as max_rows
  ),
  pattern as (
    select
      q,
      max_rows,
      '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%' as like_pattern,
      lower(q) as needle,
      lower(split_part(q, ' ', 1)) as first_word
    from params
    where char_length(q) > 0
  ),
  candidates as (
    select
      s.*,
      a.title as a_title,
      a.cover_url as a_cover_url,
      public.lyrics_plain_text(s.lyrics) as plain,
      public.has_lyrics(s) as lyrics_flag,
      p.like_pattern,
      p.needle,
      p.first_word,
      p.max_rows
    from public.songs as s
    join public.albums as a on a.id = s.album_id
    cross join pattern as p
  ),
  matches as (
    select
      c.*,
      c.title ilike c.like_pattern as title_hit,
      coalesce(c.songwriters ilike c.like_pattern, false) as writer_hit,
      coalesce(
        nullif(strpos(lower(c.plain), c.needle), 0),
        nullif(strpos(lower(c.plain), c.first_word), 0),
        1
      ) as hit_at
    from candidates as c
    where c.title ilike c.like_pattern
       or c.songwriters ilike c.like_pattern
       or c.plain ilike c.like_pattern
  ),
  ranked as (
    select
      m.*,
      greatest(1, m.hit_at - 60) as excerpt_start,
      count(*) over () as total
    from matches as m
    order by m.title_hit desc, m.writer_hit desc, m.title
    limit (select max_rows from pattern)
  )
  select
    r.id,
    r.album_id,
    r.track_number,
    r.title,
    r.songwriters,
    r.youtube_url,
    r.lwm_url,
    r.a_title,
    r.a_cover_url,
    r.lyrics_flag,
    case
      when r.plain = '' then null
      else
        case when r.excerpt_start > 1 then '...' else '' end
        || btrim(substr(r.plain, r.excerpt_start, 180))
        || case when r.excerpt_start + 180 <= char_length(r.plain) then '...' else '' end
    end,
    r.total
  from ranked as r
  order by r.title_hit desc, r.writer_hit desc, r.title;
$$;

grant execute on function public.lyrics_plain_text(text) to anon, authenticated;
grant execute on function public.has_lyrics(public.songs) to anon, authenticated;
grant execute on function public.search_songs(text, integer) to anon, authenticated;

-- Tell PostgREST about the new functions immediately.
notify pgrst, 'reload schema';
