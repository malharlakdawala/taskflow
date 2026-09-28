-- Subtasks: a task can be filed under another one.
--
-- A subtask is not a new kind of row — it is a Task like any other, with its
-- own status, assignee and notifications, just filed under a parent via
-- "parentId" and left off the board, list and calendar so it doesn't
-- double-count there (the API's GET /api/tasks filters to parentId is null).
--
-- Nesting is one level deep, enforced in the API rather than here: a task
-- that already has subtasks cannot be filed under another one, and a subtask
-- cannot itself be a parent. That is what makes "on delete cascade" safe below
-- — a subtask removed along with its parent is never itself a parent with
-- subtasks of its own to orphan.
alter table taskflow."Task"
  add column "parentId" uuid references taskflow."Task"(id) on delete cascade,
  add constraint "Task_not_own_parent" check ("parentId" is null or "parentId" <> id);

-- Fetching a task's subtasks, and checking whether one exists before allowing
-- a parent to be deleted.
create index "Task_parentId_idx" on taskflow."Task"("parentId");
