-- =====================================================================
-- Receitas de Casa — schema do banco (Supabase / PostgreSQL)
-- Execute no SQL Editor, antes de 20261108000002_seed_catalog.sql.
-- =====================================================================

create extension if not exists unaccent with schema extensions;

-- Normaliza nomes para busca/unicidade: sem acento, minúsculo, sem espaços nas pontas.
-- Wrapper IMMUTABLE (unaccent puro não é) para poder ser usado em índices.
create function public.normalize_name(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, trim(coalesce(value, ''))));
$$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- ingredients: catálogo global (created_by null) + personalizados de cada usuário
-- ---------------------------------------------------------------------
create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  default_unit text,
  created_by uuid default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index ingredients_global_name_uq
  on public.ingredients (public.normalize_name(name)) where created_by is null;
create unique index ingredients_user_name_uq
  on public.ingredients (created_by, public.normalize_name(name)) where created_by is not null;

-- ---------------------------------------------------------------------
-- recipes
-- origin_*: preenchidos quando a receita é uma cópia salva de outra pessoa.
-- source_*: link do vídeo/receita original (YouTube, Instagram, TikTok...).
-- ---------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  preparation text,
  source_url text,
  source_platform text,
  is_public boolean not null default false,
  origin_recipe_id uuid,
  origin_author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (is_public and origin_recipe_id is not null))
);

create index recipes_user_idx on public.recipes (user_id);
create index recipes_public_idx on public.recipes (is_public) where is_public;

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger recipes_touch_updated_at
  before update on public.recipes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- recipe_items: cada item é um ingrediente OU uma subreceita
-- ---------------------------------------------------------------------
create table public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position int not null default 0,
  ingredient_id uuid references public.ingredients (id) on delete restrict,
  sub_recipe_id uuid references public.recipes (id) on delete restrict,
  quantity numeric check (quantity is null or quantity > 0),
  unit text,
  check ((ingredient_id is null) <> (sub_recipe_id is null)),
  check (sub_recipe_id is distinct from recipe_id)
);

create index recipe_items_recipe_idx on public.recipe_items (recipe_id);
create index recipe_items_ingredient_idx on public.recipe_items (ingredient_id);
create index recipe_items_sub_recipe_idx on public.recipe_items (sub_recipe_id);

-- ---------------------------------------------------------------------
-- Despensa: a existência da linha significa "tenho em casa"
-- ---------------------------------------------------------------------
create table public.pantry_ingredients (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, ingredient_id)
);

-- Preparos prontos (subreceitas) que o usuário tem em casa.
create table public.pantry_recipes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

-- ---------------------------------------------------------------------
-- Semana: receitas planejadas por dia + itens avulsos da lista de compras
-- ---------------------------------------------------------------------
create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index meal_plans_user_date_idx on public.meal_plans (user_id, date);

create table public.shopping_extras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  name text not null check (length(trim(name)) > 0),
  quantity numeric,
  unit text,
  is_purchased boolean not null default false,
  created_at timestamptz not null default now()
);

create index shopping_extras_user_week_idx on public.shopping_extras (user_id, week_start);

-- =====================================================================
-- Row Level Security
-- Visitantes sem login (anon) só leem receitas públicas.
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
alter table public.pantry_ingredients enable row level security;
alter table public.pantry_recipes enable row level security;
alter table public.meal_plans enable row level security;
alter table public.shopping_extras enable row level security;

create policy "profiles_select" on public.profiles
  for select to anon, authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- recipes
create policy "recipes_select" on public.recipes
  for select to anon, authenticated using (is_public or user_id = auth.uid());
create policy "recipes_insert_own" on public.recipes
  for insert to authenticated with check (user_id = auth.uid());
create policy "recipes_update_own" on public.recipes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "recipes_delete_own" on public.recipes
  for delete to authenticated using (user_id = auth.uid());

-- recipe_items: herdam a visibilidade da receita
create policy "recipe_items_select" on public.recipe_items
  for select to anon, authenticated using (
    exists (select 1 from public.recipes r where r.id = recipe_id and (r.is_public or r.user_id = auth.uid()))
  );
create policy "recipe_items_write_own" on public.recipe_items
  for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()))
  with check (
    exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid())
    -- subreceitas precisam ser do próprio usuário
    and (sub_recipe_id is null or exists (select 1 from public.recipes s where s.id = sub_recipe_id and s.user_id = auth.uid()))
  );

-- ingredients: catálogo global + os próprios + os usados em receitas visíveis
create policy "ingredients_select" on public.ingredients
  for select to anon, authenticated using (
    created_by is null
    or created_by = auth.uid()
    or exists (select 1 from public.recipe_items ri where ri.ingredient_id = ingredients.id)
  );
create policy "ingredients_insert_own" on public.ingredients
  for insert to authenticated with check (created_by = auth.uid());
create policy "ingredients_update_own" on public.ingredients
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "ingredients_delete_own" on public.ingredients
  for delete to authenticated using (created_by = auth.uid());

-- dados pessoais: apenas o dono
create policy "pantry_ingredients_own" on public.pantry_ingredients
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "pantry_recipes_own" on public.pantry_recipes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "shopping_extras_own" on public.shopping_extras
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "meal_plans_select_own" on public.meal_plans
  for select to authenticated using (user_id = auth.uid());
create policy "meal_plans_delete_own" on public.meal_plans
  for delete to authenticated using (user_id = auth.uid());
create policy "meal_plans_insert_own" on public.meal_plans
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid())
  );

-- =====================================================================
-- Salva receita + itens numa transação (insert ou update pelo id).
-- p = { id, name, description, preparation, source_url, source_platform,
--       is_public, origin_recipe_id, origin_author_name, created_at,
--       items: [{ id, ingredient_id | sub_recipe_id, quantity, unit }] }
-- Ao publicar, as subreceitas também ficam públicas (senão quem vê a
-- receita não conseguiria ver o preparo dela).
-- =====================================================================
create function public.save_recipe(p jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_public boolean := coalesce((p ->> 'is_public')::boolean, false);
  v_saved uuid;
  v_blocker text;
begin
  if auth.uid() is null then
    raise exception 'Faça login para salvar na nuvem.';
  end if;
  if coalesce(trim(p ->> 'name'), '') = '' then
    raise exception 'O nome da receita é obrigatório.';
  end if;
  if jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'Adicione ao menos um ingrediente.';
  end if;
  if v_public and (p ->> 'origin_recipe_id') is not null then
    raise exception 'Receitas salvas de outras pessoas não podem ser publicadas.';
  end if;

  if not v_public then
    select r.name into v_blocker
      from public.recipe_items ri
      join public.recipes r on r.id = ri.recipe_id
     where ri.sub_recipe_id = v_id and r.is_public
     limit 1;
    if v_blocker is not null then
      raise exception 'Esta receita é usada pela receita pública "%". Ela precisa continuar pública.', v_blocker;
    end if;
  end if;

  insert into public.recipes as r (
    id, user_id, name, description, preparation, source_url, source_platform,
    is_public, origin_recipe_id, origin_author_name, created_at
  ) values (
    v_id, auth.uid(), trim(p ->> 'name'),
    nullif(trim(p ->> 'description'), ''), nullif(trim(p ->> 'preparation'), ''),
    nullif(trim(p ->> 'source_url'), ''), nullif(p ->> 'source_platform', ''),
    v_public, (p ->> 'origin_recipe_id')::uuid, p ->> 'origin_author_name',
    coalesce((p ->> 'created_at')::timestamptz, now())
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    preparation = excluded.preparation,
    source_url = excluded.source_url,
    source_platform = excluded.source_platform,
    is_public = excluded.is_public
  where r.user_id = auth.uid()
  returning r.id into v_saved;

  if v_saved is null then
    raise exception 'Receita não encontrada ou sem permissão.';
  end if;

  delete from public.recipe_items where recipe_id = v_id;

  insert into public.recipe_items (id, recipe_id, position, ingredient_id, sub_recipe_id, quantity, unit)
  select coalesce((e ->> 'id')::uuid, gen_random_uuid()),
         v_id,
         (ord - 1)::int,
         (e ->> 'ingredient_id')::uuid,
         (e ->> 'sub_recipe_id')::uuid,
         nullif(e ->> 'quantity', '')::numeric,
         nullif(trim(e ->> 'unit'), '')
    from jsonb_array_elements(p -> 'items') with ordinality as t(e, ord);

  if v_public then
    -- Subreceitas (em qualquer nível) também ficam públicas.
    with recursive subs as (
      select ri.sub_recipe_id as id from public.recipe_items ri
       where ri.recipe_id = v_id and ri.sub_recipe_id is not null
      union
      select ri.sub_recipe_id from public.recipe_items ri
        join subs on ri.recipe_id = subs.id
       where ri.sub_recipe_id is not null
    )
    select r.name into v_blocker
      from public.recipes r join subs on subs.id = r.id
     where r.origin_recipe_id is not null
     limit 1;
    if v_blocker is not null then
      raise exception 'A subreceita "%" foi salva de outra pessoa e não pode ser publicada.', v_blocker;
    end if;

    with recursive subs as (
      select ri.sub_recipe_id as id from public.recipe_items ri
       where ri.recipe_id = v_id and ri.sub_recipe_id is not null
      union
      select ri.sub_recipe_id from public.recipe_items ri
        join subs on ri.recipe_id = subs.id
       where ri.sub_recipe_id is not null
    )
    update public.recipes set is_public = true
     where id in (select id from subs) and user_id = auth.uid() and not is_public;
  end if;
end;
$$;

grant execute on function public.save_recipe(jsonb) to authenticated;

-- =====================================================================
-- Biblioteca pública: busca por nome da receita, ingrediente ou subreceita.
-- =====================================================================
create function public.search_public_recipes(q text default '')
returns table (
  id uuid,
  user_id uuid,
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
  with term as (select '%' || public.normalize_name(q) || '%' as t)
  select r.id, r.user_id, r.name, r.description, p.display_name,
         (select count(*) from public.recipe_items ri where ri.recipe_id = r.id),
         r.updated_at
    from public.recipes r
    cross join term
    left join public.profiles p on p.id = r.user_id
   where r.is_public
     and (
       term.t = '%%'
       or public.normalize_name(r.name) like term.t
       or exists (
         select 1 from public.recipe_items ri
           left join public.ingredients i on i.id = ri.ingredient_id
           left join public.recipes s on s.id = ri.sub_recipe_id
          where ri.recipe_id = r.id
            and (public.normalize_name(i.name) like term.t or public.normalize_name(s.name) like term.t)
       )
     )
   order by r.updated_at desc
   limit 100;
$$;

grant execute on function public.search_public_recipes(text) to anon, authenticated;
