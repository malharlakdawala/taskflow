# Contributing to TaskFlow

Thanks for taking the time. This is a small project, so the process is light.

## Where to start

The [open issues](https://github.com/malharlakdawala/taskflow/issues) are
written with pointers into the code and acceptance criteria, not one-line
wishes — pick one and say so on the issue so two people don't build it twice.
[`good first issue`](https://github.com/malharlakdawala/taskflow/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
is the shortlist.

## Before you build something big

Open an issue first for anything beyond a bug fix. It costs you five minutes
and can save you a weekend — not every feature belongs in the core, and it is
much easier to say "yes, but structured differently" before the code exists
than after.

Bug fixes, docs, and accessibility improvements never need to be asked about.
Just send them.

## Getting set up

See [Quick start](README.md#quick-start) in the README. The short version:

```bash
npm install
cp .env.example .env.local     # fill in a Supabase project
npm run dev
```

You need your own Supabase project — there is no shared development database.
The free tier is plenty.

## Before you open a pull request

```bash
npm run lint
npx tsc --noEmit
npm run build
```

CI runs exactly these three. `npm run build` needs the two
`NEXT_PUBLIC_SUPABASE_*` variables to be set to *something* — real values
locally, placeholders in CI — because they are inlined at build time.

There is no test suite yet. That is a real gap rather than a decision, and a PR
that adds one is very welcome. Until then, please say in the PR description
what you actually exercised: which pages you clicked through, which API calls
you made, what you saw.

## House style

The code is commented more heavily than most projects, and deliberately so. The
rule is: **comments explain why, never what.**

```ts
// Bad — restates the code
// Loop over the tasks and count them by status

// Good — explains a decision the code cannot
// Comparing in JS rather than with a `not` filter because SQL's NULL <> x is
// NULL, so an unassigned task would be missed by the query.
```

If you had to think about something, or you chose the less obvious option,
write down why. If it was obvious, don't.

Beyond that: match the surrounding code. TypeScript with no `any`, Tailwind for
styling, `cn()` for conditional classes, and existing components from
`src/components/ui/` rather than new ones.

## Things worth knowing before you change the data layer

Three of these have bitten people already:

- **Tables live in the `taskflow` schema, not `public`.** The schema is
  selected by the driver adapter in `src/lib/prisma.ts`. Do not add
  `?schema=` to `DATABASE_URL`.
- **DDL is owned by `supabase/migrations/`, not `prisma migrate`.**
  `prisma/schema.prisma` describes tables that already exist so Prisma can
  query them. If you change the schema, write a matching SQL migration and run
  `npx prisma generate`.
- **Notifications fan out on write.** `src/lib/notifications/dispatch.ts` is
  the single place that decides who hears about something. If you add a way to
  change a task, route it through there so the terminal and the web app agree
  about what happened.
- **Rich text is sanitised on write and on read.** It is rendered with
  `dangerouslySetInnerHTML`. Don't add a path that skips
  `src/lib/sanitize.ts`.

## Commit messages

Write a subject line that says what changed for a user, in the imperative:

```
Let people open an image instead of squinting at it
```

not `fix: add lightbox component`. If the change has a reason that isn't
obvious from the diff, put it in the body. Look at `git log` for the tone.

## Reporting a security problem

Don't open an issue — see [SECURITY.md](SECURITY.md).

## Licence

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE) that covers this project.
