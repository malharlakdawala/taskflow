-- Bridges Supabase Auth to taskflow."User". Without this, every task/comment insert
-- fails its foreign key because no application user row ever exists.
create or replace function taskflow.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = taskflow, public
as $$
begin
  insert into taskflow."User" (id, email, name, "avatarUrl")
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'name',
                         new.raw_user_meta_data ->> 'full_name', '')), ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email       = excluded.email,
        name        = coalesce(excluded.name, taskflow."User".name),
        "avatarUrl" = coalesce(excluded."avatarUrl", taskflow."User"."avatarUrl");
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function taskflow.handle_new_auth_user();

create trigger on_auth_user_updated
  after update of email, raw_user_meta_data on auth.users
  for each row execute function taskflow.handle_new_auth_user();

-- Backfill anyone who already signed up before this trigger existed.
insert into taskflow."User" (id, email, name, "avatarUrl")
select u.id,
       u.email,
       nullif(trim(coalesce(u.raw_user_meta_data ->> 'name',
                            u.raw_user_meta_data ->> 'full_name', '')), ''),
       u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
where u.email is not null
on conflict (id) do nothing;
