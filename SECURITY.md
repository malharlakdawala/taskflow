# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately through GitHub's
[Report a vulnerability](https://github.com/malharlakdawala/taskflow/security/advisories/new)
form, which opens a draft advisory only you and the maintainers can see.

Please include what you can of: the affected version or commit, what an
attacker can do, and the steps to reproduce it. A proof of concept helps but is
not required — a clear description of the flaw is enough to start.

You should get an acknowledgement within a week. If a fix is warranted it will
be released alongside an advisory that credits you, unless you would rather not
be named.

## Scope

TaskFlow is self-hosted: there is no service to attack, only the code and
whatever you deploy. In scope is anything in this repository that lets a user
do something the design says they shouldn't. Some examples of what that means
here:

- Reading or writing another workspace member's data — notifications and MCP
  tokens are private to one person, everything else is shared by design.
- Bypassing the approval gate. A `PENDING` or `REJECTED` account must not be
  able to reach any task data.
- Escalating from `MEMBER` to `ADMIN`, or reaching admin-only routes.
- Anything that gets a stored payload to execute in another user's browser.
  Rich text is sanitised on write *and* on read (`src/lib/sanitize.ts`) because
  it is rendered with `dangerouslySetInnerHTML`.
- Using an MCP personal access token to do more than its owner can, or to reach
  anything outside TaskFlow.
- Leaking `DATABASE_URL`, a Supabase key, `CRON_SECRET`, or a token's plaintext
  through a response, a log, or a client bundle.

Out of scope: findings that depend on an attacker already having your database
credentials or an admin account, misconfiguration of your own deployment, and
vulnerabilities in Next.js, Supabase or Prisma themselves — report those
upstream.

## Notes for anyone deploying this

- **`mcp-server/` needs `DATABASE_URL`**, which reaches every table in the
  Postgres instance. Do not hand it to team members. Point them at the hosted
  `/api/mcp` endpoint and personal tokens instead — that is what it is for.
- **Set `CRON_SECRET`.** Without it `/api/cron/due-soon` refuses every request,
  which is the safe failure. With a weak one, it becomes a button anybody can
  press to email your whole workspace.
- **Row level security is a backstop, not the gate.** The app enforces
  permissions in code; the policies in `supabase/migrations/` are there so a
  bug in that code doesn't become a data breach. Don't disable them.
- **Do not add the Supabase service-role key.** Nothing here needs it, and
  adding it would put a key that bypasses RLS into the deployment.
