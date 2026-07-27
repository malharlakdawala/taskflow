-- TaskFlow: isolated schema so it never collides with the existing CRM tables in public.
create schema if not exists taskflow;

create type taskflow.task_status as enum ('BACKLOG','TODO','IN_PROGRESS','IN_REVIEW','DONE');
create type taskflow.task_priority as enum ('URGENT','HIGH','MEDIUM','LOW','NONE');

-- Mirrors auth.users. id is the SAME uuid as auth.users.id so app code can use the
-- Supabase session user id directly as a foreign key.
create table taskflow."User" (
  id          uuid primary key,
  email       text not null unique,
  name        text,
  "avatarUrl" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table taskflow."Task" (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   jsonb,
  status        taskflow.task_status not null default 'TODO',
  priority      taskflow.task_priority not null default 'NONE',
  "dueDate"     timestamptz,
  "order"       double precision not null default 0,
  "assigneeId"  uuid references taskflow."User"(id) on delete set null,
  "createdById" uuid references taskflow."User"(id) on delete set null,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now()
);

create index "Task_status_idx"     on taskflow."Task"(status);
create index "Task_assigneeId_idx" on taskflow."Task"("assigneeId");
create index "Task_priority_idx"   on taskflow."Task"(priority);
create index "Task_order_idx"      on taskflow."Task"(status, "order");

create table taskflow."Comment" (
  id          uuid primary key default gen_random_uuid(),
  content     jsonb not null,
  "taskId"    uuid not null references taskflow."Task"(id) on delete cascade,
  "authorId"  uuid not null references taskflow."User"(id) on delete cascade,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index "Comment_taskId_idx" on taskflow."Comment"("taskId");

create table taskflow."Attachment" (
  id          uuid primary key default gen_random_uuid(),
  filename    text not null,
  url         text not null,
  "fileSize"  integer not null,
  "mimeType"  text not null,
  "taskId"    uuid not null references taskflow."Task"(id) on delete cascade,
  "createdAt" timestamptz not null default now()
);

create index "Attachment_taskId_idx" on taskflow."Attachment"("taskId");

create table taskflow."Tag" (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  color       text,
  "createdAt" timestamptz not null default now()
);

create table taskflow."TaskTag" (
  id       uuid primary key default gen_random_uuid(),
  "taskId" uuid not null references taskflow."Task"(id) on delete cascade,
  "tagId"  uuid not null references taskflow."Tag"(id) on delete cascade,
  constraint "TaskTag_taskId_tagId_key" unique ("taskId","tagId")
);

-- Keep updatedAt correct for writers that are not Prisma (SQL, MCP server, dashboard).
create or replace function taskflow.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$;

create trigger user_set_updated_at    before update on taskflow."User"    for each row execute function taskflow.set_updated_at();
create trigger task_set_updated_at    before update on taskflow."Task"    for each row execute function taskflow.set_updated_at();
create trigger comment_set_updated_at before update on taskflow."Comment" for each row execute function taskflow.set_updated_at();
