-- Membership model: the first account becomes the admin, everyone after that
-- lands in a pending queue with no data access until an admin approves them.
create type taskflow.user_role as enum ('ADMIN', 'MEMBER');
create type taskflow.user_status as enum ('PENDING', 'ACTIVE', 'REJECTED');

alter table taskflow."User"
  add column role   taskflow.user_role   not null default 'MEMBER',
  add column status taskflow.user_status not null default 'PENDING',
  add column "approvedAt" timestamptz,
  add column "approvedById" uuid references taskflow."User"(id) on delete set null;

create index "User_status_idx" on taskflow."User"(status);

-- Existing accounts predate this feature, so grandfather them in as active.
-- The earliest one becomes the admin.
update taskflow."User" set status = 'ACTIVE', "approvedAt" = now();

update taskflow."User" set role = 'ADMIN'
where id = (select id from taskflow."User" order by "createdAt" asc limit 1);

-- Replaces the earlier version of this trigger function. Bootstraps the very
-- first account as an active admin; everyone else starts pending.
create or replace function taskflow.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = taskflow, public
as $$
declare
  is_first boolean;
begin
  select count(*) = 0 into is_first from taskflow."User";

  insert into taskflow."User" (id, email, name, "avatarUrl", role, status, "approvedAt")
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'name',
                         new.raw_user_meta_data ->> 'full_name', '')), ''),
    new.raw_user_meta_data ->> 'avatar_url',
    case when is_first then 'ADMIN'::taskflow.user_role else 'MEMBER'::taskflow.user_role end,
    case when is_first then 'ACTIVE'::taskflow.user_status else 'PENDING'::taskflow.user_status end,
    case when is_first then now() else null end
  )
  on conflict (id) do update
    set email       = excluded.email,
        name        = coalesce(excluded.name, taskflow."User".name),
        "avatarUrl" = coalesce(excluded."avatarUrl", taskflow."User"."avatarUrl");
  return new;
end;
$$;
