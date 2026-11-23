-- Living Word Lyrics v2 — search ignores apostrophes
-- Apply in the Supabase SQL Editor after 002_slim_public_queries.sql.
--
-- "Gods", "God's" and "God’s" now find the same songs: apostrophes (straight
-- or curly) are removed from both the search text and the title, songwriters
-- and lyrics before comparing. Results, ranking and excerpts are otherwise
-- unchanged, and excerpts still show the original punctuation.

-- Lowercase and drop apostrophes; the form every search comparison uses.
create or replace function public.search_fold(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(translate(coalesce(value, ''), '''‘’ʼ`', ''));
$$;

-- Regex that finds a folded term inside unfolded, lowercased text: every
-- character may be followed by an apostrophe ("gods" matches "god's"). Used
-- only to place the excerpt around the first lyric match.
create or replace function public.search_fold_regex(term text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(coalesce(term, ''), '([^[:alnum:][:space:]])', '\\\1', 'g'),
    '(\\.|.)', '\1''?', 'g'
  );
$$;

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
      btrim(regexp_replace(public.search_fold(search_query), '\s+', ' ', 'g')) as q,
      least(greatest(coalesce(result_limit, 50), 1), 100) as max_rows
  ),
  pattern as (
    select
      q,
      max_rows,
      '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%' as like_pattern,
      public.search_fold_regex(q) as needle_re,
      public.search_fold_regex(split_part(q, ' ', 1)) as first_word_re
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
      p.needle_re,
      p.first_word_re,
      p.max_rows
    from public.songs as s
    join public.albums as a on a.id = s.album_id
    cross join pattern as p
  ),
  matches as (
    select
      c.*,
      public.search_fold(c.title) like c.like_pattern as title_hit,
      public.search_fold(c.songwriters) like c.like_pattern as writer_hit,
      coalesce(
        nullif(regexp_instr(lower(c.plain), c.needle_re), 0),
        nullif(regexp_instr(lower(c.plain), c.first_word_re), 0),
        1
      ) as hit_at
    from candidates as c
    where public.search_fold(c.title) like c.like_pattern
       or public.search_fold(c.songwriters) like c.like_pattern
       or public.search_fold(c.plain) like c.like_pattern
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

grant execute on function public.search_fold(text) to anon, authenticated;
grant execute on function public.search_fold_regex(text) to anon, authenticated;
grant execute on function public.search_songs(text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
