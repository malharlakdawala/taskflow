-- Phases: ordered stages inside a project.
--
-- A large project — "BookMyBai" with its P1.x and P2.x tasks — was being split
-- into stages by prefixing task titles, which nothing could filter or count.
-- A phase is a first-class stage: it belongs to exactly one project, has a
-- position, and optionally a planned window.
--
-- Filing a task into a phase is optional, just like filing it into a project.
-- `Task."phaseId"` is nullable and `on delete set null`, so deleting a phase
-- never destroys the work inside it — the tasks stay in the project, unphased.

create table taskflow."Phase" (
  id            uuid primary key default gen_random_uuid(),
  "projectId"   uuid not null references taskflow."Project"(id) on delete cascade,
  name          text not null,
  description   text,
  -- Position within the project. Float, same as Task.order, so a phase can be
  -- slotted between two others without renumbering the rest.
  "order"       double precision not null default 0,
  "startDate"   timestamptz,
  "endDate"     timestamptz,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now()
);

-- "Phase 1" and "phase 1" in the same project would be indistinguishable to an
-- agent that addresses phases by name, so uniqueness is per project and
-- case-insensitive. SQL-only, like Project_name_lower_key.
create unique index "Phase_projectId_name_lower_key"
  on taskflow."Phase" ("projectId", lower(name));

create index "Phase_projectId_order_idx" on taskflow."Phase" ("projectId", "order");

create trigger phase_set_updated_at
  before update on taskflow."Phase"
  for each row execute function taskflow.set_updated_at();

alter table taskflow."Task"
  add column "phaseId" uuid references taskflow."Phase"(id) on delete set null;

create index "Task_phaseId_idx" on taskflow."Task"("phaseId");

alter table taskflow."Phase" enable row level security;

-- A phase is part of its project's structure: anyone who can see the project
-- sees its phases, and editing them is an EDITOR's job. RLS is the backstop;
-- the routes enforce the same rule through requireProjectRole().
create policy "members read accessible phases" on taskflow."Phase"
  for select to authenticated
  using (taskflow.is_active_member() and taskflow.can_view_project("projectId"));

create policy "editors write accessible phases" on taskflow."Phase"
  for all to authenticated
  using (taskflow.is_active_member() and taskflow.can_edit_project("projectId"))
  with check (taskflow.is_active_member() and taskflow.can_edit_project("projectId"));

grant all on taskflow."Phase" to authenticated, service_role;
