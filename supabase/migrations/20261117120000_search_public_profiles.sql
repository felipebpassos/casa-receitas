-- Buscar amigos: pessoas pelo nome (sem acento/maiúsculas). Exige um termo: nunca lista todo mundo.
-- recipe_count = receitas e preparos públicos de autoria própria (cópias salvas não contam).

create or replace function public.search_public_profiles(q text default '')
returns table (
  id uuid,
  display_name text,
  recipe_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with term as (select public.normalize_search(q) as t)
  select p.id, p.display_name,
         (select count(*) from public.recipes r
           where r.user_id = p.id and r.visibility = 'PUBLIC' and r.origin_recipe_id is null)
    from public.profiles p
    cross join term
   where term.t <> ''
     and public.normalize_search(coalesce(p.display_name, '')) like '%' || term.t || '%'
   order by
     -- Quem começa com o termo vem antes; depois, por nome.
     (public.normalize_search(coalesce(p.display_name, '')) like term.t || '%') desc,
     p.display_name
   limit 50;
$$;

grant execute on function public.search_public_profiles(text) to anon, authenticated;
