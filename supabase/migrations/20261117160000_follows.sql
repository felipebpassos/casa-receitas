-- Seguir pessoas.
--   Qualquer um vê quantos seguidores alguém tem (follow_stats).
--   Quem a pessoa segue e quem segue ela: só ela mesma vê (RLS + list_my_follows).

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_not_self check (follower_id <> followee_id)
);

create index follows_followee_idx on public.follows (followee_id);

alter table public.follows enable row level security;

-- Só as linhas em que a pessoa é uma das pontas.
create policy "follows_select_own" on public.follows
  for select to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));

create policy "follows_insert_own" on public.follows
  for insert to authenticated
  with check (follower_id = (select auth.uid()));

create policy "follows_delete_own" on public.follows
  for delete to authenticated
  using (follower_id = (select auth.uid()));

revoke all on public.follows from anon;
revoke update on public.follows from authenticated;

-- Números do perfil. following_count só para a própria pessoa (null para os outros).
create function public.follow_stats(p_user uuid)
returns table (
  followers_count bigint,
  following_count bigint,
  is_following boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.follows f where f.followee_id = p_user),
    case when p_user = auth.uid()
         then (select count(*) from public.follows f where f.follower_id = p_user) end,
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p_user);
$$;

grant execute on function public.follow_stats(uuid) to anon, authenticated;

-- Listas da pessoa logada: 'followers' (quem me segue) ou 'following' (quem eu sigo).
-- security invoker: a RLS de follows já restringe às linhas da própria pessoa.
create function public.list_my_follows(p_kind text)
returns table (
  id uuid,
  username text,
  recipe_count bigint,
  followed_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.username,
         (select count(*) from public.recipes r
           where r.user_id = p.id and r.visibility = 'PUBLIC' and r.origin_recipe_id is null),
         f.created_at
    from public.follows f
    join public.profiles p
      on p.id = case when p_kind = 'followers' then f.follower_id else f.followee_id end
   where case when p_kind = 'followers' then f.followee_id else f.follower_id end = auth.uid()
   order by f.created_at desc
   limit 500;
$$;

revoke execute on function public.list_my_follows(text) from public, anon;
grant execute on function public.list_my_follows(text) to authenticated;
