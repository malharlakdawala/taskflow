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

-- Defence in depth, mirroring the app: any active member can see who is on a
-- project (the picker needs to render names), but only an EDITOR on that
-- project, or an admin, can change its roster.
create policy "active members read project members" on taskflow."ProjectMember"
  for select to authenticated using (taskflow.is_active_member());

create policy "editors and admins manage project members" on taskflow."ProjectMember"
  for all to authenticated
  using (
    taskflow.is_admin() or exists (
      select 1 from taskflow."ProjectMember" pm
      where pm."projectId" = "ProjectMember"."projectId"
        and pm."userId" = (select auth.uid())
        and pm.role = 'EDITOR'
    )
  )
  with check (
    taskflow.is_admin() or exists (
      select 1 from taskflow."ProjectMember" pm
      where pm."projectId" = "ProjectMember"."projectId"
        and pm."userId" = (select auth.uid())
        and pm.role = 'EDITOR'
    )
  );

grant all on taskflow."ProjectMember" to authenticated, service_role;

-- Tasks in a restricted project are only for its members (or an admin); an
-- unfiled task ("projectId" is null) stays open to every active member, as
-- before. Editing (insert/update/delete) additionally requires EDITOR, not
-- just VIEWER, on that project.
drop policy if exists "active members use tasks" on taskflow."Task";

create policy "members read accessible tasks" on taskflow."Task"
  for select to authenticated
  using (
    taskflow.is_active_member() and (
      taskflow.is_admin()
      or "projectId" is null
      or exists (
        select 1 from taskflow."ProjectMember" pm
        where pm."projectId" = "Task"."projectId" and pm."userId" = (select auth.uid())
      )
    )
  );

create policy "editors write accessible tasks" on taskflow."Task"
  for insert to authenticated
  with check (
    taskflow.is_active_member() and (
      taskflow.is_admin()
      or "projectId" is null
      or exists (
        select 1 from taskflow."ProjectMember" pm
        where pm."projectId" = "Task"."projectId" and pm."userId" = (select auth.uid())
          and pm.role = 'EDITOR'
      )
    )
  );

create policy "editors update accessible tasks" on taskflow."Task"
  for update to authenticated
  using (
    taskflow.is_active_member() and (
      taskflow.is_admin()
      or "projectId" is null
      or exists (
        select 1 from taskflow."ProjectMember" pm
        where pm."projectId" = "Task"."projectId" and pm."userId" = (select auth.uid())
          and pm.role = 'EDITOR'
      )
    )
  )
  with check (
    taskflow.is_active_member() and (
      taskflow.is_admin()
      or "projectId" is null
      or exists (
        select 1 from taskflow."ProjectMember" pm
        where pm."projectId" = "Task"."projectId" and pm."userId" = (select auth.uid())
          and pm.role = 'EDITOR'
      )
    )
  );

create policy "editors delete accessible tasks" on taskflow."Task"
  for delete to authenticated
  using (
    taskflow.is_active_member() and (
      taskflow.is_admin()
      or "projectId" is null
      or exists (
        select 1 from taskflow."ProjectMember" pm
        where pm."projectId" = "Task"."projectId" and pm."userId" = (select auth.uid())
          and pm.role = 'EDITOR'
      )
    )
  );
