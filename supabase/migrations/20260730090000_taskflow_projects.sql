-- Projects: a named grouping for tasks.
--
-- Until now every task lived in one flat pile. Status and priority say what
-- state a task is in, and tags were meant to label them, but neither answers
-- "what body of work is this part of?" — which is the question people ask
-- first when a workspace holds more than a couple of dozen tasks.
--
-- Membership is optional and always has been implicitly: `Task."projectId"` is
-- nullable, so every existing row keeps working and unfiled work is a real,
-- permanent state rather than a migration step. The UI calls it "No project".

create table taskflow."Project" (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  -- One of the fixed palette keys in src/lib/types.ts, not free-form CSS: the
  -- value is rendered into a class name, so it must never be attacker-chosen.
  color         text,
  -- Archived projects stay readable and keep their tasks; they just drop out of
  -- the sidebar and the pickers. This is the intended way to retire a project,
  -- which is why deleting one is rarer than it looks.
  archived      boolean not null default false,
  "createdById" uuid references taskflow."User"(id) on delete set null,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now()
);

-- Two projects called "Website" and "website" are a support ticket waiting to
-- happen, so uniqueness is case-insensitive. Prisma cannot express a functional
-- index, so this one is SQL-only — schema.prisma carries a note. A collision
-- surfaces as a unique violation (P2002), which the API turns into a 409.
create unique index "Project_name_lower_key"
  on taskflow."Project" (lower(name));

-- The sidebar's query: unarchived projects, alphabetical. Partial, because
-- archived rows are excluded from it by definition.
create index "Project_active_name_idx"
  on taskflow."Project" (name)
  where archived = false;

create trigger project_set_updated_at
  before update on taskflow."Project"
  for each row execute function taskflow.set_updated_at();

-- on delete set null, matching "assigneeId" and "createdById": removing a
-- container must never destroy the work inside it. A deleted project's tasks
-- fall back to unfiled rather than disappearing.
alter table taskflow."Task"
  add column "projectId" uuid references taskflow."Project"(id) on delete set null;

-- Filtering the board and list by project.
create index "Task_projectId_idx" on taskflow."Task"("projectId");

alter table taskflow."Project" enable row level security;

-- Same rule as tasks and tags: any approved member may use them. RLS is the
-- backstop; the routes enforce this in code through requireMember().
create policy "active members use projects" on taskflow."Project"
  for all to authenticated
  using (taskflow.is_active_member()) with check (taskflow.is_active_member());

grant all on taskflow."Project" to authenticated, service_role;
