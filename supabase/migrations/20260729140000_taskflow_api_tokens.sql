-- Personal access tokens for the hosted MCP endpoint.
--
-- The stdio server in mcp-server/ talks to Postgres directly, which means
-- running it requires DATABASE_URL — a credential that reaches every table in
-- this project, including the other application's tables in `public`. That is
-- fine for the person who owns the database and unacceptable for everyone
-- else, so members connect to /api/mcp with a token instead. Requests then run
-- as that member through the same code the web UI uses.
--
-- Only the hash is stored. A leaked backup of this table cannot be replayed
-- against the API, and the plaintext is shown exactly once, at creation.

create table taskflow."ApiToken" (
  id           uuid primary key default gen_random_uuid(),
  "userId"     uuid not null references taskflow."User"(id) on delete cascade,
  -- What the member called it, so several machines can be told apart.
  name         text not null,
  -- The leading characters, kept in the clear so the UI can show which token
  -- a row refers to without being able to reconstruct it.
  prefix       text not null,
  "tokenHash"  text not null unique,
  "lastUsedAt" timestamptz,
  "createdAt"  timestamptz not null default now()
);

-- Every authenticated MCP request is this lookup, so it has to be an index
-- hit; the unique constraint above provides it.
create index "ApiToken_userId_idx" on taskflow."ApiToken"("userId");

alter table taskflow."ApiToken" enable row level security;

-- A token belongs to one person. Not even an admin has a reason to read
-- someone else's hashes, and nobody can read the plaintext regardless.
create policy "read own tokens" on taskflow."ApiToken"
  for select to authenticated using ((select auth.uid()) = "userId");
create policy "create own tokens" on taskflow."ApiToken"
  for insert to authenticated with check ((select auth.uid()) = "userId");
create policy "revoke own tokens" on taskflow."ApiToken"
  for delete to authenticated using ((select auth.uid()) = "userId");

grant all on taskflow."ApiToken" to authenticated, service_role;
