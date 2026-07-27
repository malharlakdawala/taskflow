-- Defence in depth: the app enforces approval in code, but RLS should agree.
create or replace function taskflow.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from taskflow."User"
    where id = (select auth.uid()) and status = 'ACTIVE'
  );
$$;

create or replace function taskflow.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from taskflow."User"
    where id = (select auth.uid()) and status = 'ACTIVE' and role = 'ADMIN'
  );
$$;

drop policy if exists "authenticated read users"         on taskflow."User";
drop policy if exists "authenticated update self"        on taskflow."User";
drop policy if exists "authenticated all tasks"          on taskflow."Task";
drop policy if exists "authenticated all attachments"    on taskflow."Attachment";
drop policy if exists "authenticated all tags"           on taskflow."Tag";
drop policy if exists "authenticated all tasktags"       on taskflow."TaskTag";
drop policy if exists "authenticated read comments"      on taskflow."Comment";
drop policy if exists "authenticated insert own comment" on taskflow."Comment";
drop policy if exists "authenticated update own comment" on taskflow."Comment";
drop policy if exists "authenticated delete own comment" on taskflow."Comment";

-- You can always see your own row, so the pending screen can read its status.
create policy "read own or roster" on taskflow."User"
  for select to authenticated
  using ((select auth.uid()) = id or taskflow.is_active_member());
create policy "update own profile" on taskflow."User"
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "admin manages members" on taskflow."User"
  for update to authenticated
  using (taskflow.is_admin()) with check (taskflow.is_admin());
create policy "admin removes members" on taskflow."User"
  for delete to authenticated using (taskflow.is_admin());

create policy "active members use tasks" on taskflow."Task"
  for all to authenticated
  using (taskflow.is_active_member()) with check (taskflow.is_active_member());
create policy "active members use attachments" on taskflow."Attachment"
  for all to authenticated
  using (taskflow.is_active_member()) with check (taskflow.is_active_member());
create policy "active members use tags" on taskflow."Tag"
  for all to authenticated
  using (taskflow.is_active_member()) with check (taskflow.is_active_member());
create policy "active members use tasktags" on taskflow."TaskTag"
  for all to authenticated
  using (taskflow.is_active_member()) with check (taskflow.is_active_member());

create policy "active members read comments" on taskflow."Comment"
  for select to authenticated using (taskflow.is_active_member());
create policy "active members write own comment" on taskflow."Comment"
  for insert to authenticated
  with check (taskflow.is_active_member() and (select auth.uid()) = "authorId");
create policy "authors edit own comment" on taskflow."Comment"
  for update to authenticated using ((select auth.uid()) = "authorId");
create policy "authors or admins delete comment" on taskflow."Comment"
  for delete to authenticated
  using ((select auth.uid()) = "authorId" or taskflow.is_admin());
