-- In-app notifications.
--
-- Email already tells people what happened, but it only works if they read
-- their inbox. This table is the same set of events kept inside the app, so a
-- member can open the bell and catch up on everything since they last looked.
--
-- Each row is one event for one recipient — a comment that reaches two people
-- writes two rows. Fan-out on write costs a few extra inserts; fan-out on read
-- would mean recomputing everyone's feed on every page load.

create type taskflow.notification_type as enum (
  'TASK_ASSIGNED',
  'TASK_UPDATED',
  'TASK_COMMENT',
  'TASK_DUE_SOON',
  'ACCOUNT_APPROVED'
);

create table taskflow."Notification" (
  id          uuid primary key default gen_random_uuid(),
  -- Who sees it.
  "userId"    uuid not null references taskflow."User"(id) on delete cascade,
  -- Who caused it. Null for system events like the due-date digest.
  "actorId"   uuid references taskflow."User"(id) on delete set null,
  type        taskflow.notification_type not null,
  -- Rendered at write time rather than at read time: the feed then needs no
  -- joins, and a notification still reads correctly after the task is renamed.
  title       text not null,
  body        text,
  -- Where clicking it goes. Stored so a new notification type never needs the
  -- client to learn a new URL shape.
  url         text not null,
  "taskId"    uuid references taskflow."Task"(id) on delete cascade,
  "commentId" uuid references taskflow."Comment"(id) on delete cascade,
  "readAt"    timestamptz,
  "createdAt" timestamptz not null default now()
);

-- The feed query: one user's rows, newest first.
create index "Notification_userId_createdAt_idx"
  on taskflow."Notification"("userId", "createdAt" desc);

-- The badge query. Partial, because read rows are the overwhelming majority
-- and none of them belong in this index.
create index "Notification_userId_unread_idx"
  on taskflow."Notification"("userId")
  where "readAt" is null;

-- Lets the due-date digest check "have I already told them about this task?"
-- without scanning the user's whole history.
create index "Notification_taskId_idx" on taskflow."Notification"("taskId");

alter table taskflow."Notification" enable row level security;

-- The app enforces this in code too; RLS is the backstop. A notification is
-- private to its recipient — not even an admin has a reason to read someone
-- else's feed.
create policy "read own notifications" on taskflow."Notification"
  for select to authenticated using ((select auth.uid()) = "userId");
create policy "mark own notifications read" on taskflow."Notification"
  for update to authenticated
  using ((select auth.uid()) = "userId") with check ((select auth.uid()) = "userId");
create policy "clear own notifications" on taskflow."Notification"
  for delete to authenticated using ((select auth.uid()) = "userId");
-- No insert policy for `authenticated`: rows are written by server code on
-- behalf of an actor, never by the recipient's own session.

grant all on taskflow."Notification" to authenticated, service_role;
