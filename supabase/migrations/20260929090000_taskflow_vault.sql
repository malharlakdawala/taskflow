-- Credential vault: a stored password/credential, filed under a project.
-- Deliberately no "unfiled" bucket, unlike Task — every entry lives in a
-- project's folder, which is also its access boundary.
--
-- Gated at EDITOR, not VIEWER: seeing a task is not the same bar as seeing a
-- password, so a project's read-only members never see this table at all.
-- Reuses taskflow.can_edit_project(), the same helper the Task/Comment/
-- Attachment policies already use.
--
-- The `secret` column never holds plaintext — the app encrypts it
-- (AES-256-GCM, src/lib/vault-crypto.ts) before every write. A leak of this
-- table alone, without the app's VAULT_ENCRYPTION_KEY, reveals nothing.
create table taskflow."VaultEntry" (
  id            uuid primary key default gen_random_uuid(),
  "projectId"   uuid not null references taskflow."Project"(id) on delete cascade,
  name          text not null,
  username      text,
  secret        text,
  url           text,
  notes         text,
  "createdById" uuid references taskflow."User"(id) on delete set null,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now()
);

create index "VaultEntry_projectId_idx" on taskflow."VaultEntry"("projectId");

create trigger vaultentry_set_updated_at
  before update on taskflow."VaultEntry"
  for each row execute function taskflow.set_updated_at();

alter table taskflow."VaultEntry" enable row level security;

create policy "editors read accessible vault entries" on taskflow."VaultEntry"
  for select to authenticated
  using (taskflow.is_active_member() and taskflow.can_edit_project("projectId"));

create policy "editors write accessible vault entries" on taskflow."VaultEntry"
  for insert to authenticated
  with check (taskflow.is_active_member() and taskflow.can_edit_project("projectId"));

create policy "editors update accessible vault entries" on taskflow."VaultEntry"
  for update to authenticated
  using (taskflow.is_active_member() and taskflow.can_edit_project("projectId"))
  with check (taskflow.is_active_member() and taskflow.can_edit_project("projectId"));

create policy "editors delete accessible vault entries" on taskflow."VaultEntry"
  for delete to authenticated
  using (taskflow.is_active_member() and taskflow.can_edit_project("projectId"));

grant all on taskflow."VaultEntry" to authenticated, service_role;
