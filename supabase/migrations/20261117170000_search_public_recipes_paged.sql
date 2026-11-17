-- Busca do Explorar paginada, com o total de resultados.
--   p_kind: 'RECIPE', 'PREP' ou null (todas).
--   p_exclude: receitas públicas que a pessoa já salvou (não aparecem nem contam).
--   As receitas da própria pessoa logada também ficam de fora.
--   total_count: quantos resultados a busca tem (todas as páginas).
--   matched_count: o mesmo, contando as já salvas (para "você já salvou tudo").

drop function public.search_public_recipes(text);

create function public.search_public_recipes(
  q text default '',
  p_kind text default null,
  p_exclude uuid[] default '{}',
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  user_id uuid,
  kind text,
  name text,
  description text,
  author_name text,
  item_count bigint,
  updated_at timestamptz,
  total_count bigint,
  matched_count bigint
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
       and r.user_id is distinct from auth.uid()
       and (p_kind is null or (case when r.kind = 'PREP' then 'PREP' else 'RECIPE' end) = p_kind)
  ),
  matched as (
    select b.*, count(*) over () as matched_count
      from base b
      cross join term
     where term.t = '%%'
        or public.normalize_search(b.name) like term.t
        or exists (
          select 1 from public.recipe_items ri
            left join public.ingredients i on i.id = ri.ingredient_id
            left join public.recipes s on s.id = ri.sub_recipe_id
           where ri.recipe_id = b.id
             and (public.normalize_search(i.name) like term.t or public.normalize_search(s.name) like term.t)
        )
  )
  select m.id, m.user_id, m.kind, m.name, m.description, p.username, m.item_count, m.updated_at,
         count(*) over () as total_count, m.matched_count
    from matched m
    left join public.profiles p on p.id = m.user_id
   where not (m.id = any (coalesce(p_exclude, '{}')))
   order by m.updated_at desc, m.id
   limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.search_public_recipes(text, text, uuid[], int, int) to anon, authenticated;
