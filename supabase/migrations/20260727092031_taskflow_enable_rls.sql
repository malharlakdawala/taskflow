-- Shared workspace: any signed-in user can read/write all tasks. anon gets nothing.
alter table taskflow."User"       enable row level security;
alter table taskflow."Task"       enable row level security;
alter table taskflow."Comment"    enable row level security;
alter table taskflow."Attachment" enable row level security;
alter table taskflow."Tag"        enable row level security;
alter table taskflow."TaskTag"    enable row level security;

-- Everyone signed in can see the roster (needed for the assignee picker),
-- but may only edit their own profile row.
create policy "authenticated read users"  on taskflow."User"
  for select to authenticated using (true);
create policy "authenticated update self" on taskflow."User"
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "authenticated all tasks"       on taskflow."Task"
  for all to authenticated using (true) with check (true);
create policy "authenticated all attachments" on taskflow."Attachment"
  for all to authenticated using (true) with check (true);
create policy "authenticated all tags"        on taskflow."Tag"
  for all to authenticated using (true) with check (true);
create policy "authenticated all tasktags"    on taskflow."TaskTag"
  for all to authenticated using (true) with check (true);

-- Comments are readable by all, but you may only write/edit/delete your own.
create policy "authenticated read comments"   on taskflow."Comment"
  for select to authenticated using (true);
create policy "authenticated insert own comment" on taskflow."Comment"
  for insert to authenticated with check ((select auth.uid()) = "authorId");
create policy "authenticated update own comment" on taskflow."Comment"
  for update to authenticated using ((select auth.uid()) = "authorId");
create policy "authenticated delete own comment" on taskflow."Comment"
  for delete to authenticated using ((select auth.uid()) = "authorId");

-- The taskflow schema is deliberately NOT exposed to the Data API, so the public
-- anon key cannot reach these tables at all. Belt and braces:
revoke all on all tables in schema taskflow from anon;
revoke all on schema taskflow from anon;

grant usage on schema taskflow to authenticated, service_role;
grant all on all tables in schema taskflow to authenticated, service_role;
alter default privileges in schema taskflow grant all on tables to authenticated, service_role;
