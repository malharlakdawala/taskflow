-- Project-level permissions: until now every active member could see and edit
-- every task, and the workspace being "shared" was a documented, deliberate
-- choice. This adds a way to narrow that per project, for teams who share one
-- workspace but not every project in it.
--
-- A task with no project stays visible to every active member exactly as
-- before — only filing a task into a restricted project takes it out of the
-- shared pile. Global admins bypass membership entirely, same as they already
-- bypass everything else (taskflow.is_admin()).
create type taskflow.project_role as enum ('VIEWER', 'EDITOR');

create table taskflow."ProjectMember" (
  id          uuid primary key default gen_random_uuid(),
  "projectId" uuid not null references taskflow."Project"(id) on delete cascade,
  "userId"    uuid not null references taskflow."User"(id) on delete cascade,
  role        taskflow.project_role not null default 'EDITOR',
  "createdAt" timestamptz not null default now(),
  constraint "ProjectMember_projectId_userId_key" unique ("projectId", "userId")
);

create index "ProjectMember_userId_idx" on taskflow."ProjectMember"("userId");

-- Backfill: every existing project gets every existing active member as an
-- EDITOR. Without this, the moment this migration lands, every project on a
-- live deployment would have an empty roster and vanish for everyone but an
-- admin — the opposite of what this feature is for. Restricting access to a
-- project is something an admin or editor now does on purpose, from here on;
-- it should never happen automatically, to work already in progress.
insert into taskflow."ProjectMember" ("projectId", "userId", role)
select p.id, u.id, 'EDITOR'
from taskflow."Project" p
cross join taskflow."User" u
where u.status = 'ACTIVE'
on conflict ("projectId", "userId") do nothing;

alter table taskflow."ProjectMember" enable row level security;

-- The same access rule gets checked on Task, Comment and Attachment below, so
-- it lives here once rather than as a repeated subquery on every policy. A
-- null project id (unfiled work) is always visible; an admin bypasses
-- everything; otherwise it comes down to the roster.
create or replace function taskflow.can_view_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_project_id is null or taskflow.is_admin() or exists (
    select 1 from taskflow."ProjectMember" pm
    where pm."projectId" = p_project_id and pm."userId" = (select auth.uid())
  );
$$;

-- Same rule, but EDITOR only — the bar for changing something rather than
-- just reading it.
create or replace function taskflow.can_edit_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_project_id is null or taskflow.is_admin() or exists (
    select 1 from taskflow."ProjectMember" pm
    where pm."projectId" = p_project_id
      and pm."userId" = (select auth.uid())
      and pm.role = 'EDITOR'
  );
$$;

-- Defence in depth, mirroring the app: any active member can see who is on a
-- project (the picker needs to render names), but only an EDITOR on that
-- project, or an admin, can change its roster. "projectId" here is never
-- null, so can_edit_project's null-shortcut never applies — it just falls
-- through to the admin/roster check.
create policy "active members read project members" on taskflow."ProjectMember"
  for select to authenticated using (taskflow.is_active_member());

create policy "editors and admins manage project members" on taskflow."ProjectMember"
  for all to authenticated
  using (taskflow.can_edit_project("projectId"))
  with check (taskflow.can_edit_project("projectId"));

grant all on taskflow."ProjectMember" to authenticated, service_role;

-- Tasks in a restricted project are only for its members (or an admin); an
-- unfiled task stays open to every active member, as before. Editing
-- (insert/update/delete) additionally requires EDITOR, not just VIEWER.
drop policy if exists "active members use tasks" on taskflow."Task";

create policy "members read accessible tasks" on taskflow."Task"
  for select to authenticated
  using (taskflow.is_active_member() and taskflow.can_view_project("projectId"));

create policy "editors write accessible tasks" on taskflow."Task"
  for insert to authenticated
  with check (taskflow.is_active_member() and taskflow.can_edit_project("projectId"));

create policy "editors update accessible tasks" on taskflow."Task"
  for update to authenticated
  using (taskflow.is_active_member() and taskflow.can_edit_project("projectId"))
  with check (taskflow.is_active_member() and taskflow.can_edit_project("projectId"));

create policy "editors delete accessible tasks" on taskflow."Task"
  for delete to authenticated
  using (taskflow.is_active_member() and taskflow.can_edit_project("projectId"));

-- Comments and attachments belong to a task, so their own project check goes
-- through it. The read policies replace the old blanket "any active member"
-- ones; the author-only edit/delete rules on Comment are untouched — they
-- were never about project access in the first place.
drop policy if exists "active members read comments" on taskflow."Comment";
drop policy if exists "active members write own comment" on taskflow."Comment";

create policy "members read accessible comments" on taskflow."Comment"
  for select to authenticated
  using (
    taskflow.is_active_member()
    and taskflow.can_view_project(
      (select t."projectId" from taskflow."Task" t where t.id = "Comment"."taskId")
    )
  );

create policy "editors write accessible comments" on taskflow."Comment"
  for insert to authenticated
  with check (
    taskflow.is_active_member()
    and (select auth.uid()) = "authorId"
    and taskflow.can_edit_project(
      (select t."projectId" from taskflow."Task" t where t.id = "Comment"."taskId")
    )
  );

drop policy if exists "active members use attachments" on taskflow."Attachment";

create policy "members read accessible attachments" on taskflow."Attachment"
  for select to authenticated
  using (
    taskflow.is_active_member()
    and taskflow.can_view_project(
      (select t."projectId" from taskflow."Task" t where t.id = "Attachment"."taskId")
    )
  );

create policy "editors write accessible attachments" on taskflow."Attachment"
  for insert to authenticated
  with check (
    taskflow.is_active_member()
    and taskflow.can_edit_project(
      (select t."projectId" from taskflow."Task" t where t.id = "Attachment"."taskId")
    )
  );

create policy "editors delete accessible attachments" on taskflow."Attachment"
  for delete to authenticated
  using (
    taskflow.is_active_member()
    and taskflow.can_edit_project(
      (select t."projectId" from taskflow."Task" t where t.id = "Attachment"."taskId")
    )
  );
