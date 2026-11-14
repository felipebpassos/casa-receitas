-- =====================================================================
-- Receitas e Preparos.
--   RECIPE (receita): prato completo (lasanha, pizza). Pode usar preparos como ingrediente.
--   PREP (preparo): base usada dentro de receitas (arroz, molho de tomate). Só ingredientes do catálogo.
-- O tipo é escolhido ao criar e não muda depois.
-- Cópias salvas de outras pessoas (origin_recipe_id) ficam como vieram: as regras valem só para as próprias.
-- =====================================================================

alter table public.recipes
  add column kind text not null default 'RECIPE' check (kind in ('RECIPE', 'PREP'));

-- Dados existentes: quem já é usado como subreceita (e não usa outra) vira preparo.
update public.recipes r
   set kind = 'PREP'
 where exists (select 1 from public.recipe_items ri where ri.sub_recipe_id = r.id)
   and not exists (select 1 from public.recipe_items ri where ri.recipe_id = r.id and ri.sub_recipe_id is not null);

-- =====================================================================
-- save_recipe: igual à anterior, mais o tipo (gravado só ao criar) e as regras de preparo.
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
  v_is_copy boolean := (p ->> 'origin_recipe_id') is not null;
  v_kind text;
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
  if v_submit and v_is_copy then
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

  if not v_submit then
    select r.name into v_blocker
      from public.recipe_items ri
      join public.recipes r on r.id = ri.recipe_id
     where ri.sub_recipe_id = v_id and r.status in ('PENDING', 'APPROVED')
     limit 1;
    if v_blocker is not null then
      raise exception 'Este preparo é usado pela receita "%", que está na biblioteca ou em análise. Ele precisa continuar enviado.', v_blocker;
    end if;
  end if;

  insert into public.recipes as r (
    id, user_id, kind, name, description, preparation, source_url, source_platform,
    status, origin_recipe_id, origin_author_name, created_at
  ) values (
    v_id, auth.uid(), v_kind, trim(p ->> 'name'),
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
      raise exception 'O preparo "%" foi salvo de outra pessoa e não pode ser publicado.', v_blocker;
    end if;

    -- Preparos (em qualquer nível) vão para análise junto; os já aprovados ficam como estão.
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
-- Biblioteca pública: agora devolve também o tipo (muda o retorno, então recria).
-- =====================================================================
drop function public.search_public_recipes(text);

create function public.search_public_recipes(q text default '')
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
  with term as (select '%' || public.normalize_name(q) || '%' as t)
  select r.id, r.user_id, r.kind, r.name, r.description, p.display_name,
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

grant execute on function public.search_public_recipes(text) to anon, authenticated;
