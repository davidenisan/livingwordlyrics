-- Living Word Lyrics v2 — site-wide recent searches and song reactions
-- Apply in the Supabase SQL Editor after 002_slim_public_queries.sql.

-- ---------------------------------------------------------------------------
-- Recent searches (shown to everyone on the home page)
-- ---------------------------------------------------------------------------
-- The table is never read or written directly by browsers (RLS on, no
-- policies, no grants). Writes go through log_search(), which only records a
-- query that actually matches the library, so arbitrary text (spam, abuse)
-- cannot appear on the home page. Rows older than 30 days are pruned.

create table if not exists public.search_log (
  id bigint generated always as identity primary key,
  query text not null,
  created_at timestamptz not null default now()
);

create index if not exists search_log_created_idx on public.search_log (created_at desc);
create index if not exists search_log_query_idx on public.search_log (query, created_at desc);

alter table public.search_log enable row level security;
revoke all on table public.search_log from anon, authenticated;

create or replace function public.log_search(search_query text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q text := lower(btrim(regexp_replace(translate(coalesce(search_query, ''), '‘’', ''''''), '\s+', ' ', 'g')));
begin
  if char_length(q) < 3 or char_length(q) > 60 then
    return;
  end if;

  -- Only searches that find something are worth showing (and this keeps
  -- made-up text off the public list).
  if not exists (select 1 from public.search_songs(q, 1)) then
    return;
  end if;

  -- Ignore repeats of the same query within 10 minutes, and cap the overall
  -- write rate so the list cannot be flooded.
  if exists (
    select 1 from public.search_log
    where query = q and created_at > now() - interval '10 minutes'
  ) then
    return;
  end if;

  if (select count(*) from public.search_log where created_at > now() - interval '1 minute') >= 30 then
    return;
  end if;

  insert into public.search_log (query) values (q);
  delete from public.search_log where created_at < now() - interval '30 days';
end;
$$;

create or replace function public.recent_searches(max_rows integer default 12)
returns table (query text, last_searched timestamptz, times bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select l.query, max(l.created_at) as last_searched, count(*) as times
  from public.search_log as l
  where l.created_at > now() - interval '30 days'
  group by l.query
  order by max(l.created_at) desc
  limit least(greatest(coalesce(max_rows, 12), 1), 30);
$$;

revoke all on function public.log_search(text) from public;
revoke all on function public.recent_searches(integer) from public;
grant execute on function public.log_search(text) to anon, authenticated;
grant execute on function public.recent_searches(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Song reactions
-- ---------------------------------------------------------------------------
-- Reacting needs a Supabase session. Visitors get one through an anonymous
-- sign-in that Supabase Auth only allows after a Cloudflare Turnstile captcha
-- (Auth → Bot and Abuse Protection). Each person can give each reaction once
-- per song; counts are public through song_reaction_counts().

create table if not exists public.song_reactions (
  song_id bigint not null references public.songs (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reaction text not null check (reaction in ('pray', 'love', 'fire', 'praise')),
  created_at timestamptz not null default now(),
  primary key (song_id, user_id, reaction)
);

create index if not exists song_reactions_song_idx on public.song_reactions (song_id);
create index if not exists song_reactions_user_idx on public.song_reactions (user_id);

alter table public.song_reactions enable row level security;

revoke all on table public.song_reactions from anon, authenticated;
grant select, insert, delete on table public.song_reactions to authenticated;

drop policy if exists "Users read own reactions" on public.song_reactions;
create policy "Users read own reactions"
on public.song_reactions for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users add own reactions" on public.song_reactions;
create policy "Users add own reactions"
on public.song_reactions for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Users remove own reactions" on public.song_reactions;
create policy "Users remove own reactions"
on public.song_reactions for delete to authenticated
using (user_id = (select auth.uid()));

create or replace function public.song_reaction_counts(target_song_id bigint)
returns table (reaction text, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.reaction, count(*) as total
  from public.song_reactions as r
  where r.song_id = target_song_id
  group by r.reaction;
$$;

revoke all on function public.song_reaction_counts(bigint) from public;
grant execute on function public.song_reaction_counts(bigint) to anon, authenticated;

notify pgrst, 'reload schema';
