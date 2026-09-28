-- A task already had a deadline ("dueDate"). Give it a planned start too, so
-- the Gantt view has a real span to draw instead of a single point in time.
-- Independent of status on purpose: scheduling when work begins is a planning
-- decision, not something that should force a task out of Backlog.
alter table taskflow."Task"
  add column "startDate" timestamptz;
