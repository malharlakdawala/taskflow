-- Invitations: bring someone into the workspace without waiting for them to
-- find the sign-up page.
--
-- Until now membership only ever went one way — a stranger signs up, lands in
-- PENDING, and an admin approves them. That works, but it means the admin
-- cannot start anything: there is no way to say "Arpit should be in here" until
-- Arpit has already turned up on his own.
--
-- An invitation is a row plus a link. The link carries a 256-bit token that
-- exists in exactly one place — the email we send — and only its SHA-256 hash
-- is stored here, so a copy of this table cannot be replayed into access.
-- Presenting the token is what proves the holder received the invite, which is
-- why acceptance is keyed on it rather than on the email address alone: with
-- Supabase email confirmation switched off, matching on email would let anyone
-- claim an invitation by typing someone else's address into the sign-up form.
--
-- Deliberately NOT auth.users. Supabase's own invite flow (auth.admin
-- .inviteUserByEmail) would need a service-role key in the running deployment,
-- and this project keeps that key out of production on purpose — see
-- .env.example. This table gets the same result with the app's own credentials.

create table taskflow."Invitation" (
  id            uuid primary key default gen_random_uuid(),
  -- Always stored lower-cased by the API, so a plain unique index is enough to
  -- make invitations case-insensitive per address. One live invitation per
  -- address: re-inviting someone updates the row and re-issues the token.
  email         text not null,
  role          taskflow.user_role not null default 'MEMBER',
  -- SHA-256 of the token. The plaintext is never stored.
  "tokenHash"   text not null unique,
  "invitedById" uuid references taskflow."User"(id) on delete set null,
  "expiresAt"   timestamptz not null,
  -- Set when the invited person signs in and claims it. Kept rather than
  -- deleted so "how did this member get here?" has an answer.
  "acceptedAt"  timestamptz,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now()
);

create unique index "Invitation_email_key" on taskflow."Invitation" (email);

-- The settings screen's query: everything still outstanding, newest first.
create index "Invitation_outstanding_idx"
  on taskflow."Invitation" ("createdAt" desc)
  where "acceptedAt" is null;

create trigger invitation_set_updated_at
  before update on taskflow."Invitation"
  for each row execute function taskflow.set_updated_at();

alter table taskflow."Invitation" enable row level security;

-- Admins only, and even they reach this through the API rather than the
-- Supabase client. Note that accepting an invitation is a write by the invited
-- person, who is not an admin — that path runs through Prisma on the app's own
-- connection, as every other write in this app does, so this policy is the
-- backstop for direct client access and not the gate on the feature.
create policy "admin manages invitations" on taskflow."Invitation"
  for all to authenticated
  using (taskflow.is_admin()) with check (taskflow.is_admin());

grant all on taskflow."Invitation" to authenticated, service_role;
