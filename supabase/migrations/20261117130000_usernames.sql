-- Nome de usuário (@usuario): único, com regras de nickname, e a identidade exibida no app.
--   3–20 caracteres, a-z 0-9 . _ ; começa com letra; '.'/'_' sem repetir e nunca no fim.
--   Guardado sempre em minúsculas → o índice único simples já ignora maiúsculas.
--   username_confirmed = false: gerado pelo sistema (Google / contas antigas); o app pede para confirmar.
-- display_name continua na tabela, mas não é mais usado.

alter table public.profiles
  add column username text,
  add column username_confirmed boolean not null default false;

create function public.is_valid_username(u text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select u is not null and length(u) between 3 and 20 and u ~ '^[a-z][a-z0-9]*([._][a-z0-9]+)*$';
$$;

alter table public.profiles
  add constraint profiles_username_format check (username is null or public.is_valid_username(username));

create unique index profiles_username_key on public.profiles (username);

-- Base válida a partir de um texto qualquer (ex.: começo do e-mail).
create function public.username_base(src text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  b text := public.normalize_name(src);              -- minúsculas, sem acento
begin
  b := regexp_replace(b, '[^a-z0-9._]+', '.', 'g');   -- inválidos → '.'
  b := regexp_replace(b, '[._]{2,}', '.', 'g');       -- separadores repetidos
  b := regexp_replace(b, '^[^a-z]+', '');             -- começa com letra
  b := left(b, 20);
  b := regexp_replace(b, '[._]+$', '');               -- sem separador no fim
  if not public.is_valid_username(b) then b := 'usuario'; end if;  -- curto demais / vazio
  return b;
end;
$$;

-- Primeiro livre: base, base2, base3… (sempre cabendo em 20).
create function public.next_free_username(base text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n int := 1;
  cand text := base;
  stem text;
begin
  while exists (select 1 from public.profiles where username = cand) loop
    n := n + 1;
    stem := regexp_replace(left(base, 20 - length(n::text)), '[._]+$', '');
    cand := stem || n::text;
  end loop;
  return cand;
end;
$$;

revoke execute on function public.next_free_username(text) from public, anon, authenticated;

-- Contas existentes: gera a partir do e-mail, para confirmarem no app.
do $$
declare
  r record;
begin
  for r in
    select p.id, u.email
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.username is null
     order by p.created_at
  loop
    update public.profiles
       set username = public.next_free_username(public.username_base(split_part(coalesce(r.email, ''), '@', 1)))
     where id = r.id;
  end loop;
end;
$$;

alter table public.profiles alter column username set not null;

-- Cadastro: usa o usuário escolhido (e-mail/senha); senão gera e marca para confirmar.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  chosen boolean;
  uname text;
begin
  chosen := public.is_valid_username(wanted)
            and not exists (select 1 from public.profiles where username = wanted);
  uname := case when chosen then wanted
                else public.next_free_username(public.username_base(split_part(coalesce(new.email, ''), '@', 1))) end;

  insert into public.profiles (id, display_name, username, username_confirmed)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      uname
    ),
    uname,
    chosen
  );
  return new;
end;
$$;

-- Ninguém altera a tabela direto: o usuário muda só por set_username.
revoke update on public.profiles from anon, authenticated;

create function public.username_available(u text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_valid_username(lower(btrim(u)))
     and not exists (select 1 from public.profiles where username = lower(btrim(u)));
$$;

grant execute on function public.username_available(text) to anon, authenticated;

create function public.set_username(u text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text := lower(btrim(coalesce(u, '')));
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para escolher um nome de usuário.' using errcode = '42501';
  end if;
  if not public.is_valid_username(v) then
    raise exception 'Nome de usuário inválido. Use 3 a 20 caracteres: letras minúsculas, números, ponto e _.' using errcode = '22023';
  end if;
  begin
    update public.profiles set username = v, username_confirmed = true where id = auth.uid();
  exception when unique_violation then
    raise exception 'Esse nome de usuário já está em uso.' using errcode = '23505';
  end;
  return v;
end;
$$;

revoke execute on function public.set_username(text) from public, anon;
grant execute on function public.set_username(text) to authenticated;

-- Buscar amigos: só pelo usuário exato (com ou sem @, maiúsculas ignoradas).
drop function public.search_public_profiles(text);

create function public.search_public_profiles(q text default '')
returns table (
  id uuid,
  username text,
  recipe_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.username,
         (select count(*) from public.recipes r
           where r.user_id = p.id and r.visibility = 'PUBLIC' and r.origin_recipe_id is null)
    from public.profiles p
   where p.username = lower(ltrim(btrim(coalesce(q, '')), '@'));
$$;

grant execute on function public.search_public_profiles(text) to anon, authenticated;

-- Autor das receitas passa a ser o usuário.
create or replace function public.search_public_recipes(q text default '')
returns table (
  id uuid,
  user_id uuid,
  kind text,
  name text,
  description text,
  author_name text,
  item_count bigint,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with term as (select '%' || public.normalize_search(q) || '%' as t),
  base as (
    select r.id, r.user_id, r.kind,
           coalesce(e.snapshot ->> 'name', r.name) as name,
           case when e.recipe_id is null then r.description else e.snapshot ->> 'description' end as description,
           case when e.recipe_id is null
                then (select count(*) from public.recipe_items ri where ri.recipe_id = r.id)
                else jsonb_array_length(e.snapshot -> 'recipe_items') end as item_count,
           coalesce((e.snapshot ->> 'updated_at')::timestamptz, r.updated_at) as updated_at
      from public.recipes r
      left join public.recipe_pending_edits e on e.recipe_id = r.id
     where r.listed
  )
  select b.id, b.user_id, b.kind, b.name, b.description, p.username, b.item_count, b.updated_at
    from base b
    cross join term
    left join public.profiles p on p.id = b.user_id
   where term.t = '%%'
      or public.normalize_search(b.name) like term.t
      or exists (
        select 1 from public.recipe_items ri
          left join public.ingredients i on i.id = ri.ingredient_id
          left join public.recipes s on s.id = ri.sub_recipe_id
         where ri.recipe_id = b.id
           and (public.normalize_search(i.name) like term.t or public.normalize_search(s.name) like term.t)
      )
   order by b.updated_at desc
   limit 100;
$$;

create or replace function public.list_user_public_recipes(p_user uuid)
returns table (
  id uuid,
  user_id uuid,
  kind text,
  name text,
  description text,
  author_name text,
  item_count bigint,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id, r.user_id, r.kind,
         coalesce(e.snapshot ->> 'name', r.name),
         case when e.recipe_id is null then r.description else e.snapshot ->> 'description' end,
         p.username,
         case when e.recipe_id is null
              then (select count(*) from public.recipe_items ri where ri.recipe_id = r.id)
              else jsonb_array_length(e.snapshot -> 'recipe_items') end,
         coalesce((e.snapshot ->> 'updated_at')::timestamptz, r.updated_at)
    from public.recipes r
    left join public.recipe_pending_edits e on e.recipe_id = r.id
    left join public.profiles p on p.id = r.user_id
   where r.user_id = p_user and r.visibility = 'PUBLIC' and r.origin_recipe_id is null
   order by 8 desc
   limit 200;
$$;
