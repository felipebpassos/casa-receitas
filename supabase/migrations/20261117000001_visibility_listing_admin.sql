-- =====================================================================
-- Visibilidade, destaque na busca e administradores.
--
--   visibility: PRIVATE (só o dono) | PUBLIC (qualquer pessoa, no perfil do autor).
--               Escolhida pelo dono. Não há mais "em análise" nem "recusada" para o usuário.
--   listed:     aparece na busca do Explorar. Decisão interna, nunca mostrada ao usuário.
--               Só admins (pelo app, nas próprias receitas) e o painel do Supabase marcam.
--   profiles.is_admin: receitas/preparos públicos salvos por admin já entram listados.
--
-- Edição de receita listada (dono não admin): quem vê de fora continua vendo a versão
-- aprovada (snapshot em recipe_pending_edits) até um admin aprovar a edição.
--
-- Operação pelo painel (SQL editor):
--   update public.profiles set is_admin = true where id = '<user id>';     -- tornar admin
--   update public.recipes set listed = true where id = '<recipe id>';      -- mostrar na busca
--   update public.recipes set listed = false where id = '<recipe id>';     -- tirar da busca
--   select * from public.recipe_pending_edits order by edited_at;          -- edições aguardando
--   select public.approve_recipe_edit('<recipe id>');                      -- edição vale na busca
--   select public.reject_recipe_edit('<recipe id>');                       -- tira da busca (continua no perfil)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Administradores
-- ---------------------------------------------------------------------
alter table public.profiles add column is_admin boolean not null default false;

-- Pelo app só dá para mudar o nome de exibição (ninguém se promove a admin).
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Visibilidade e destaque (substituem status / moderação)
-- ---------------------------------------------------------------------
drop trigger recipes_cascade_approval on public.recipes;
drop function public.recipes_cascade_approval();
drop trigger recipes_guard_status on public.recipes;
drop function public.recipes_guard_status();

drop policy "recipes_select" on public.recipes;
drop policy "recipe_items_select" on public.recipe_items;
drop policy "recipe_items_write_own" on public.recipe_items;

alter table public.recipes
  add column visibility text not null default 'PRIVATE' check (visibility in ('PRIVATE', 'PUBLIC')),
  add column listed boolean not null default false,
  add column listed_at timestamptz;

-- Converte sem mexer em updated_at (é a ordem da busca).
alter table public.recipes disable trigger recipes_touch_updated_at;
update public.recipes
   set visibility = case when status in ('APPROVED', 'PENDING') then 'PUBLIC' else 'PRIVATE' end,
       listed = status = 'APPROVED',
       listed_at = case when status = 'APPROVED' then coalesce(reviewed_at, updated_at) end;
alter table public.recipes enable trigger recipes_touch_updated_at;

alter table public.recipes drop constraint recipes_copy_private;
drop index public.recipes_status_idx;
alter table public.recipes
  drop column status,
  drop column rejection_reason,
  drop column reviewed_at;

alter table public.recipes
  add constraint recipes_copy_private check (origin_recipe_id is null or visibility = 'PRIVATE'),
  add constraint recipes_listed_public check (not listed or visibility = 'PUBLIC');

create index recipes_listed_idx on public.recipes (updated_at) where listed;
create index recipes_public_user_idx on public.recipes (user_id) where visibility = 'PUBLIC';

-- Usuários comuns do app não mexem em listed (fica como estava; ao criar, false).
-- Admin pelo app e o painel (postgres/service_role) podem. Privada nunca fica listada.
create function public.recipes_guard_listing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.listed := false;
      new.listed_at := null;
    else
      new.listed := old.listed;
      new.listed_at := old.listed_at;
    end if;
  end if;
  if new.visibility = 'PRIVATE' then
    new.listed := false;
  end if;
  if not new.listed then
    new.listed_at := null;
  elsif tg_op = 'INSERT' or not old.listed then
    new.listed_at := now();
  end if;
  return new;
end;
$$;

create trigger recipes_guard_listing
  before insert or update on public.recipes
  for each row execute function public.recipes_guard_listing();

-- Ao listar uma receita, os preparos dela (em qualquer nível) também ficam públicos e listados;
-- senão quem a encontra na busca não conseguiria abrir os preparos.
create function public.recipes_cascade_listing()
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
  update public.recipes set visibility = 'PUBLIC', listed = true
   where id in (select id from subs) and not listed and origin_recipe_id is null;
  return null;
end;
$$;

create trigger recipes_cascade_listing
  after update of listed on public.recipes
  for each row
  when (new.listed and not old.listed)
  execute function public.recipes_cascade_listing();

-- Visibilidade: públicas para todos; as suas para você.
create policy "recipes_select" on public.recipes
  for select to anon, authenticated using (visibility = 'PUBLIC' or user_id = auth.uid());

create policy "recipe_items_select" on public.recipe_items
  for select to anon, authenticated using (
    exists (select 1 from public.recipes r where r.id = recipe_id and (r.visibility = 'PUBLIC' or r.user_id = auth.uid()))
  );

create policy "recipe_items_write_own" on public.recipe_items
  for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()))
  with check (
    exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid())
    and (sub_recipe_id is null or exists (select 1 from public.recipes s where s.id = sub_recipe_id and s.user_id = auth.uid()))
  );

-- ---------------------------------------------------------------------
-- 3. Edições de receitas listadas, aguardando aprovação
-- ---------------------------------------------------------------------
-- snapshot = versão aprovada (linha da receita + recipe_items, no formato do RECIPE_SELECT do app).
create table public.recipe_pending_edits (
  recipe_id uuid primary key references public.recipes (id) on delete cascade,
  snapshot jsonb not null,
  edited_at timestamptz not null default now()
);

alter table public.recipe_pending_edits enable row level security;
-- Só leitura pelo app (o snapshot é o que os outros veem); escrita só pelas funções abaixo e pelo painel.
create policy "recipe_pending_edits_select" on public.recipe_pending_edits
  for select to anon, authenticated using (
    exists (select 1 from public.recipes r where r.id = recipe_id and (r.visibility = 'PUBLIC' or r.user_id = auth.uid()))
  );

-- Estado atual da receita, no formato do snapshot.
create function public.recipe_snapshot(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select to_jsonb(r) || jsonb_build_object(
    'recipe_items',
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ri.id, 'position', ri.position, 'ingredient_id', ri.ingredient_id,
               'sub_recipe_id', ri.sub_recipe_id, 'quantity', ri.quantity, 'unit', ri.unit
             ) order by ri.position)
        from public.recipe_items ri where ri.recipe_id = r.id
    ), '[]'::jsonb)
  )
  from public.recipes r where r.id = p_id;
$$;

-- Só o que o usuário edita (para saber se a edição voltou a ser igual à aprovada).
create function public.recipe_content(s jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'name', s -> 'name',
    'description', s -> 'description',
    'preparation', s -> 'preparation',
    'source_url', s -> 'source_url',
    'source_platform', s -> 'source_platform',
    'items', coalesce((
      select jsonb_agg(jsonb_build_array(i -> 'ingredient_id', i -> 'sub_recipe_id', (i ->> 'quantity')::numeric, i -> 'unit')
                       order by (i ->> 'position')::int)
        from jsonb_array_elements(s -> 'recipe_items') as t(i)
    ), '[]'::jsonb)
  );
$$;

-- Guarda a versão aprovada antes da primeira edição do dono (não admin) numa receita listada.
-- Monta o snapshot do que está gravado agora; chamar à toa só "congela" a versão atual.
create function public.queue_listed_edit(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_admin() then
    return;
  end if;
  if exists (select 1 from public.recipes r where r.id = p_id and r.user_id = auth.uid() and r.listed) then
    insert into public.recipe_pending_edits (recipe_id, snapshot)
    values (p_id, public.recipe_snapshot(p_id))
    on conflict (recipe_id) do nothing;
  end if;
end;
$$;

-- Depois de salvar: se a receita voltou a ficar igual à aprovada, sai da fila.
create function public.settle_listed_edit(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.recipe_pending_edits e
   using public.recipes r
   where e.recipe_id = p_id and r.id = p_id and r.user_id = auth.uid()
     and public.recipe_content(e.snapshot) = public.recipe_content(public.recipe_snapshot(p_id));
end;
$$;

revoke execute on function public.queue_listed_edit(uuid) from public, anon;
revoke execute on function public.settle_listed_edit(uuid) from public, anon;
grant execute on function public.queue_listed_edit(uuid) to authenticated;
grant execute on function public.settle_listed_edit(uuid) to authenticated;

-- Pega qualquer caminho de edição pelo app (save_recipe ou update/insert direto).
create function public.recipes_queue_listed_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and old.listed
     and (new.name, new.description, new.preparation, new.source_url, new.source_platform)
         is distinct from (old.name, old.description, old.preparation, old.source_url, old.source_platform) then
    perform public.queue_listed_edit(old.id);
  end if;
  return new;
end;
$$;

create trigger recipes_queue_listed_edit
  before update on public.recipes
  for each row execute function public.recipes_queue_listed_edit();

create function public.recipe_items_queue_listed_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- pg_trigger_depth() > 1 num DELETE = cascata da exclusão da própria receita: nada a guardar.
  if current_user in ('anon', 'authenticated') and (tg_op <> 'DELETE' or pg_trigger_depth() = 1) then
    perform public.queue_listed_edit(case when tg_op = 'DELETE' then old.recipe_id else new.recipe_id end);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger recipe_items_queue_listed_edit
  before insert or update or delete on public.recipe_items
  for each row execute function public.recipe_items_queue_listed_edit();

-- Saiu da busca (ou ficou privada): a fila não faz mais sentido.
create function public.recipes_clear_pending_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.recipe_pending_edits where recipe_id = new.id;
  return null;
end;
$$;

create trigger recipes_clear_pending_edit
  after update of listed on public.recipes
  for each row
  when (old.listed and not new.listed)
  execute function public.recipes_clear_pending_edit();

-- Painel: aprovar (a edição passa a valer na busca) ou recusar (sai da busca, continua no perfil).
create function public.approve_recipe_edit(p_recipe uuid)
returns void
language sql
set search_path = ''
as $$
  delete from public.recipe_pending_edits where recipe_id = p_recipe;
$$;

create function public.reject_recipe_edit(p_recipe uuid)
returns void
language sql
set search_path = ''
as $$
  update public.recipes set listed = false where id = p_recipe;
  delete from public.recipe_pending_edits where recipe_id = p_recipe;
$$;

revoke execute on function public.approve_recipe_edit(uuid) from public, anon, authenticated;
revoke execute on function public.reject_recipe_edit(uuid) from public, anon, authenticated;

-- =====================================================================
-- 4. save_recipe: visibility no lugar de submit (submit ainda aceito por apps antigos).
-- =====================================================================
create or replace function public.save_recipe(p jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_visibility text := coalesce(
    nullif(p ->> 'visibility', ''),
    case when coalesce((p ->> 'submit')::boolean, false) then 'PUBLIC' else 'PRIVATE' end
  );
  v_public boolean;
  v_admin boolean := public.is_admin();
  v_is_copy boolean := (p ->> 'origin_recipe_id') is not null;
  v_kind text;
  v_saved uuid;
  v_blocker text;
begin
  if auth.uid() is null then
    raise exception 'Faça login para salvar na nuvem.';
  end if;
  if v_visibility not in ('PRIVATE', 'PUBLIC') then
    raise exception 'Visibilidade inválida.';
  end if;
  v_public := v_visibility = 'PUBLIC';
  if coalesce(trim(p ->> 'name'), '') = '' then
    raise exception 'O nome da receita é obrigatório.';
  end if;
  if jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'Adicione ao menos um ingrediente.';
  end if;
  if v_public and v_is_copy then
    raise exception 'Receitas salvas de outras pessoas não podem ser publicadas.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p -> 'items') as t(e)
     where (e ->> 'ingredient_id') is not null
       and not exists (select 1 from public.ingredients i where i.id = (e ->> 'ingredient_id')::uuid)
  ) then
    raise exception 'Use apenas ingredientes do catálogo.';
  end if;

  -- O tipo não muda depois de criado: numa edição vale o que já está gravado.
  select r.kind into v_kind from public.recipes r where r.id = v_id;
  v_kind := coalesce(v_kind, nullif(p ->> 'kind', ''), 'RECIPE');
  if v_kind not in ('RECIPE', 'PREP') then
    raise exception 'Tipo de receita inválido.';
  end if;

  if not v_is_copy then
    if v_kind = 'PREP' and exists (
      select 1 from jsonb_array_elements(p -> 'items') as t(e) where (e ->> 'sub_recipe_id') is not null
    ) then
      raise exception 'Preparos usam apenas ingredientes do catálogo.';
    end if;

    select r.name into v_blocker
      from jsonb_array_elements(p -> 'items') as t(e)
      join public.recipes r on r.id = (e ->> 'sub_recipe_id')::uuid
     where r.kind <> 'PREP'
     limit 1;
    if v_blocker is not null then
      raise exception '"%" é uma receita, não um preparo. Só preparos podem ser usados como ingrediente.', v_blocker;
    end if;
  end if;

  if not v_public then
    select r.name into v_blocker
      from public.recipe_items ri
      join public.recipes r on r.id = ri.recipe_id
     where ri.sub_recipe_id = v_id and r.visibility = 'PUBLIC'
     limit 1;
    if v_blocker is not null then
      raise exception 'Este preparo é usado pela receita "%", que é pública. Ele precisa continuar público.', v_blocker;
    end if;
  end if;

  -- listed: o trigger recipes_guard_listing ignora o valor para quem não é admin.
  insert into public.recipes as r (
    id, user_id, kind, name, description, preparation, source_url, source_platform,
    visibility, listed, origin_recipe_id, origin_author_name, created_at
  ) values (
    v_id, auth.uid(), v_kind, trim(p ->> 'name'),
    nullif(trim(p ->> 'description'), ''), nullif(trim(p ->> 'preparation'), ''),
    nullif(trim(p ->> 'source_url'), ''), nullif(p ->> 'source_platform', ''),
    v_visibility, v_admin and v_public,
    (p ->> 'origin_recipe_id')::uuid, p ->> 'origin_author_name',
    coalesce((p ->> 'created_at')::timestamptz, now())
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    preparation = excluded.preparation,
    source_url = excluded.source_url,
    source_platform = excluded.source_platform,
    visibility = excluded.visibility,
    listed = excluded.listed
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
      raise exception 'O preparo "%" foi salvo de outra pessoa e não pode ser publicado.', v_blocker;
    end if;

    -- Preparos (em qualquer nível) ficam públicos junto; com admin, também entram na busca.
    with recursive subs as (
      select ri.sub_recipe_id as id from public.recipe_items ri
       where ri.recipe_id = v_id and ri.sub_recipe_id is not null
      union
      select ri.sub_recipe_id from public.recipe_items ri
        join subs on ri.recipe_id = subs.id
       where ri.sub_recipe_id is not null
    )
    update public.recipes set visibility = 'PUBLIC', listed = listed or v_admin
     where id in (select id from subs) and user_id = auth.uid()
       and (visibility = 'PRIVATE' or (v_admin and not listed));
  end if;

  perform public.settle_listed_edit(v_id);
end;
$$;

-- =====================================================================
-- 5. Busca (só listadas) e perfil público (todas as públicas do autor).
-- Receita listada com edição pendente aparece como a versão aprovada.
-- =====================================================================
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
  select b.id, b.user_id, b.kind, b.name, b.description, p.display_name, b.item_count, b.updated_at
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

create function public.list_user_public_recipes(p_user uuid)
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
         p.display_name,
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

grant execute on function public.list_user_public_recipes(uuid) to anon, authenticated;
