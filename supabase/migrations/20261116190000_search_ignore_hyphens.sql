-- Busca de receitas públicas ignorando hífens e espaços repetidos, além de acentos
-- e maiúsculas: "pimenta da" encontra "Pimenta-da-jamaica".
-- normalize_name continua igual (é a regra do índice único de nomes de ingredientes).

create function public.normalize_search(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(translate(public.normalize_name(value), '-‐‑–—', '     '), '\s+', ' ', 'g'));
$$;

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
  with term as (select '%' || public.normalize_search(q) || '%' as t)
  select r.id, r.user_id, r.kind, r.name, r.description, p.display_name,
         (select count(*) from public.recipe_items ri where ri.recipe_id = r.id),
         r.updated_at
    from public.recipes r
    cross join term
    left join public.profiles p on p.id = r.user_id
   where r.status = 'APPROVED'
     and (
       term.t = '%%'
       or public.normalize_search(r.name) like term.t
       or exists (
         select 1 from public.recipe_items ri
           left join public.ingredients i on i.id = ri.ingredient_id
           left join public.recipes s on s.id = ri.sub_recipe_id
          where ri.recipe_id = r.id
            and (public.normalize_search(i.name) like term.t or public.normalize_search(s.name) like term.t)
       )
     )
   order by r.updated_at desc
   limit 100;
$$;
