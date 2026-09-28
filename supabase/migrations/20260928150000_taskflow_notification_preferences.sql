-- Per-member email preferences. These only ever gate the *email* copy of a
-- notification — the in-app feed always gets one, so turning off mail can
-- never make an event disappear entirely. Account approval and workspace
-- invitations are not covered: a person who cannot yet see the app has no
-- feed for that mail to fall back to.
alter table taskflow."User"
  add column "emailOnAssigned" boolean not null default true,
  add column "emailOnComment"  boolean not null default true,
  add column "emailOnDueSoon"  boolean not null default true;
