-- =====================================================================
-- Modelo enxuto:
--   1. Sai a Despensa (pantry_*). A lista de compras passa a ter itens riscados por semana.
--   2. Catálogo fechado de ingredientes (sem ingredientes personalizados) + sugestões.
--   3. Receitas públicas passam por moderação: status PRIVATE → PENDING → APPROVED/REJECTED.
--      Só o dono do app (painel do Supabase, fora do papel "authenticated") aprova.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Despensa
-- ---------------------------------------------------------------------
drop table public.pantry_recipes;
drop table public.pantry_ingredients;

-- Item riscado na lista de compras da semana (a linha existir = riscado).
-- recipe_id é o grupo (receita ou subpreparo) em que o item aparece.
-- unit é a unidade já normalizada (kg→g, l→ml; '' quando não há).
create table public.shopping_checks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  unit text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, week_start, recipe_id, ingredient_id, unit)
);

alter table public.shopping_checks enable row level security;
create policy "shopping_checks_own" on public.shopping_checks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2. Catálogo fechado
-- ---------------------------------------------------------------------
-- Ingredientes personalizados: viram o global de mesmo nome; sem correspondente,
-- o primeiro de cada nome vira global e os repetidos (de outros usuários) apontam para ele.
create temp table _ingredient_map as
select c.id as old_id,
       coalesce(
         (select g.id from public.ingredients g
           where g.created_by is null and public.normalize_name(g.name) = public.normalize_name(c.name)),
         first_value(c.id) over (partition by public.normalize_name(c.name) order by c.created_at, c.id)
       ) as new_id
  from public.ingredients c
 where c.created_by is not null;

update public.recipe_items ri
   set ingredient_id = m.new_id
  from _ingredient_map m
 where ri.ingredient_id = m.old_id and m.old_id <> m.new_id;

delete from public.ingredients i
 using _ingredient_map m
 where i.id = m.old_id and m.old_id <> m.new_id;

drop table _ingredient_map;

drop policy "ingredients_select" on public.ingredients;
drop policy "ingredients_insert_own" on public.ingredients;
drop policy "ingredients_update_own" on public.ingredients;
drop policy "ingredients_delete_own" on public.ingredients;
drop index public.ingredients_global_name_uq;
drop index public.ingredients_user_name_uq;
alter table public.ingredients drop column created_by;

create unique index ingredients_name_uq on public.ingredients (public.normalize_name(name));

-- Unidades aceitas no formulário da receita (null = todas).
alter table public.ingredients add column allowed_units text[];

-- Todo mundo lê; ninguém do app escreve (só o painel / migrations).
create policy "ingredients_select" on public.ingredients
  for select to anon, authenticated using (true);

-- Sugestões de ingredientes que faltam no catálogo.
-- Aprovar = inserir em public.ingredients pelo painel e mudar o status para APPROVED.
create table public.ingredient_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  unit text,
  note text check (note is null or length(note) <= 300),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  created_at timestamptz not null default now()
);

create index ingredient_suggestions_status_idx on public.ingredient_suggestions (status, created_at);

alter table public.ingredient_suggestions enable row level security;
create policy "ingredient_suggestions_select_own" on public.ingredient_suggestions
  for select to authenticated using (user_id = auth.uid());
create policy "ingredient_suggestions_insert_own" on public.ingredient_suggestions
  for insert to authenticated with check (user_id = auth.uid() and status = 'PENDING');

-- ---------------------------------------------------------------------
-- 3. Moderação de receitas
-- ---------------------------------------------------------------------
drop policy "recipes_select" on public.recipes;
drop policy "recipe_items_select" on public.recipe_items;
drop policy "recipe_items_write_own" on public.recipe_items;

alter table public.recipes
  add column status text not null default 'PRIVATE'
    check (status in ('PRIVATE', 'PENDING', 'APPROVED', 'REJECTED')),
  add column rejection_reason text,
  add column reviewed_at timestamptz;

update public.recipes set status = 'APPROVED', reviewed_at = now() where is_public;

-- Leva junto o check (is_public, origin_recipe_id) e o índice recipes_public_idx.
alter table public.recipes drop column is_public;

-- Cópias de receitas de outras pessoas não podem ir para a biblioteca.
alter table public.recipes
  add constraint recipes_copy_private check (origin_recipe_id is null or status = 'PRIVATE');

create index recipes_status_idx on public.recipes (status) where status <> 'PRIVATE';

-- Visibilidade: aprovadas para todos; as suas para você.
create policy "recipes_select" on public.recipes
  for select to anon, authenticated using (status = 'APPROVED' or user_id = auth.uid());

create policy "recipe_items_select" on public.recipe_items
  for select to anon, authenticated using (
    exists (select 1 from public.recipes r where r.id = recipe_id and (r.status = 'APPROVED' or r.user_id = auth.uid()))
  );

-- Itens de receita aprovada não mudam direto (save_recipe primeiro a devolve para análise).
create policy "recipe_items_write_own" on public.recipe_items
  for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid() and r.status <> 'APPROVED'))
  with check (
    exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid() and r.status <> 'APPROVED')
    and (sub_recipe_id is null or exists (select 1 from public.recipes s where s.id = sub_recipe_id and s.user_id = auth.uid()))
  );

-- Usuários do app (anon/authenticated) só podem deixar a receita PRIVATE ou PENDING.
-- Qualquer alteração deles numa receita APPROVED a devolve para PENDING.
-- O painel do Supabase (postgres/service_role) pode tudo.
create function public.recipes_guard_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'UPDATE' and new.status = old.status then
      if old.status = 'APPROVED' then
        new.status := 'PENDING';
        new.reviewed_at := null;
      else
        new.rejection_reason := old.rejection_reason;
        new.reviewed_at := old.reviewed_at;
      end if;
    elsif new.status not in ('PRIVATE', 'PENDING') then
      raise exception 'Somente a moderação pode aprovar ou recusar receitas.';
    else
      new.rejection_reason := null;
      new.reviewed_at := null;
    end if;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('APPROVED', 'REJECTED') then
    new.reviewed_at := now();
    if new.status = 'APPROVED' then
      new.rejection_reason := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger recipes_guard_status
  before insert or update on public.recipes
  for each row execute function public.recipes_guard_status();

-- Ao aprovar uma receita, as subreceitas dela (em qualquer nível) também são aprovadas;
-- senão quem vê a receita não conseguiria ver o preparo das subreceitas.
create function public.recipes_cascade_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  with recursive subs as (
    select ri.sub_recipe_id as id from public.recipe_items ri
     where ri.recipe_id = new.id and ri.sub_recipe_id is not null
    union
    select ri.sub_recipe_id from public.recipe_items ri
      join subs on ri.recipe_id = subs.id
     where ri.sub_recipe_id is not null
  )
  update public.recipes set status = 'APPROVED'
   where id in (select id from subs) and status <> 'APPROVED';
  return null;
end;
$$;

create trigger recipes_cascade_approval
  after update of status on public.recipes
  for each row
  when (new.status = 'APPROVED' and old.status is distinct from 'APPROVED')
  execute function public.recipes_cascade_approval();

-- =====================================================================
-- Salva receita + itens numa transação (insert ou update pelo id).
-- p = { id, name, description, preparation, source_url, source_platform,
--       submit, origin_recipe_id, origin_author_name, created_at,
--       items: [{ id, ingredient_id | sub_recipe_id, quantity, unit }] }
-- submit = true: envia para a biblioteca (PENDING), junto com as subreceitas
-- que ainda não foram aprovadas. submit = false: fica só para o dono (PRIVATE).
-- =====================================================================
create or replace function public.save_recipe(p jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_submit boolean := coalesce((p ->> 'submit')::boolean, false);
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
  if v_submit and (p ->> 'origin_recipe_id') is not null then
    raise exception 'Receitas salvas de outras pessoas não podem ser publicadas.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p -> 'items') as t(e)
     where (e ->> 'ingredient_id') is not null
       and not exists (select 1 from public.ingredients i where i.id = (e ->> 'ingredient_id')::uuid)
  ) then
    raise exception 'Use apenas ingredientes do catálogo.';
  end if;

  if not v_submit then
    select r.name into v_blocker
      from public.recipe_items ri
      join public.recipes r on r.id = ri.recipe_id
     where ri.sub_recipe_id = v_id and r.status in ('PENDING', 'APPROVED')
     limit 1;
    if v_blocker is not null then
      raise exception 'Esta receita é usada pela receita "%", que está na biblioteca ou em análise. Ela precisa continuar enviada.', v_blocker;
    end if;
  end if;

  insert into public.recipes as r (
    id, user_id, name, description, preparation, source_url, source_platform,
    status, origin_recipe_id, origin_author_name, created_at
  ) values (
    v_id, auth.uid(), trim(p ->> 'name'),
    nullif(trim(p ->> 'description'), ''), nullif(trim(p ->> 'preparation'), ''),
    nullif(trim(p ->> 'source_url'), ''), nullif(p ->> 'source_platform', ''),
    case when v_submit then 'PENDING' else 'PRIVATE' end,
    (p ->> 'origin_recipe_id')::uuid, p ->> 'origin_author_name',
    coalesce((p ->> 'created_at')::timestamptz, now())
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    preparation = excluded.preparation,
    source_url = excluded.source_url,
    source_platform = excluded.source_platform,
    status = excluded.status
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

  if v_submit then
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

    -- Subreceitas (em qualquer nível) vão para análise junto; as já aprovadas ficam como estão.
    with recursive subs as (
      select ri.sub_recipe_id as id from public.recipe_items ri
       where ri.recipe_id = v_id and ri.sub_recipe_id is not null
      union
      select ri.sub_recipe_id from public.recipe_items ri
        join subs on ri.recipe_id = subs.id
       where ri.sub_recipe_id is not null
    )
    update public.recipes set status = 'PENDING'
     where id in (select id from subs) and user_id = auth.uid() and status in ('PRIVATE', 'REJECTED');
  end if;
end;
$$;

-- =====================================================================
-- Biblioteca pública: somente receitas aprovadas.
-- =====================================================================
create or replace function public.search_public_recipes(q text default '')
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
   where r.status = 'APPROVED'
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
