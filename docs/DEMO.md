# Running a public demo

A demo instance is a normal TaskFlow deployment with three differences: it
advertises its own credentials on the login screen, it holds nothing real, and
it puts itself back together on a schedule.

**Do not point this at a database you care about.** The reset endpoint deletes
every task in it.

## 1. A separate Supabase project

Not the one your team uses. Free tier is fine.

Apply the migrations exactly as in the README quick start (`supabase link` then
`supabase db push`, or paste them in order).

## 2. Seed it

From your machine, with `.env.local` pointing at the demo project:

```bash
SUPABASE_SERVICE_ROLE_KEY=<demo project service_role> npm run seed
```

That creates three fictional members and a workspace of 20 tasks. The password
is `taskflow-demo` unless you set `DEMO_PASSWORD`.

The service-role key is used here and never again — do not add it to the
deployment.

## 3. Deploy with demo mode on

Environment variables for the demo deployment:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | the demo project's URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the demo project's publishable key |
| `DATABASE_URL` | the demo project's pooler string |
| `NEXT_PUBLIC_DEMO_MODE` | `true` |
| `NEXT_PUBLIC_DEMO_EMAIL` | `ada@example.com` |
| `NEXT_PUBLIC_DEMO_PASSWORD` | `taskflow-demo` |
| `CRON_SECRET` | `openssl rand -hex 32` |

Deliberately **not** set:

- **No `BREVO_API_KEY`.** Without it the app sends no mail at all, which is
  what you want when strangers are assigning tasks to fictional people.
- **No `SUPABASE_SERVICE_ROLE_KEY`.** Nothing at runtime needs it.

`NEXT_PUBLIC_DEMO_MODE` puts a panel on the login screen with the credentials
and a "Fill in" button, so nobody has to sign up and wait for approval.

## 4. Reset it on a schedule

`GET /api/cron/demo-reset` rebuilds the tasks, comments and notifications. It
leaves the accounts alone, so it needs no service-role key.

It is behind two gates: the deployment must have `NEXT_PUBLIC_DEMO_MODE=true`
(otherwise it 404s, permanently), and the caller must present `CRON_SECRET`.

Add this to `vercel.json` **on the demo deployment only** — it is deliberately
not in the repo's `vercel.json`, so a normal deployment doesn't burn a cron
slot on a route that will always 404:

```json
{
  "crons": [
    { "path": "/api/cron/due-soon", "schedule": "30 2 * * *" },
    { "path": "/api/cron/demo-reset", "schedule": "0 * * * *" }
  ]
}
```

Vercel's Hobby plan only runs crons once a day, so hourly needs a paid plan or
an external pinger (cron-job.org and similar work fine — they just need to send
the `Authorization: Bearer <CRON_SECRET>` header).

To reset by hand:

```bash
curl https://your-demo.vercel.app/api/cron/demo-reset \
  -H "Authorization: Bearer $CRON_SECRET"
```

## What visitors can do

Everything a real member can, including admin actions — the demo account is an
admin so the Settings screen is worth looking at. That means a visitor can
reject members, generate MCP tokens, and delete every task. All of it is undone
by the next reset, which is why the reset matters more than locking things
down.

Sign-ups still work and still land in the pending queue. If that becomes
tiresome, turn off email sign-up in Supabase → Authentication → Providers; the
demo credentials keep working.
