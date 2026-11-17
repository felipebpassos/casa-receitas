-- O nome livre (display_name) foi substituído pelo nome de usuário: remove a coluna.

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

  insert into public.profiles (id, username, username_confirmed)
  values (new.id, uname, chosen);
  return new;
end;
$$;

alter table public.profiles drop column display_name;
