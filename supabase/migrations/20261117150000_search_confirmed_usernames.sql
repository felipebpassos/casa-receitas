-- Buscar amigos: só quem já confirmou o nome de usuário (o sugerido pelo sistema não aparece).

create or replace function public.search_public_profiles(q text default '')
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
   where p.username_confirmed
     and p.username = lower(ltrim(btrim(coalesce(q, '')), '@'));
$$;
