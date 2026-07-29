# What changed

<!-- What does this do for someone using TaskFlow? One or two sentences. -->

Closes #

# Why

<!-- The reason the diff can't show on its own. Skip if it's genuinely obvious. -->

# How it was tested

<!--
There is no test suite yet, so please say what you actually exercised:
which pages you clicked through, which API calls you made, what you saw.
"Ran the build" is not testing.
-->

# Checklist

- [ ] `npm run lint` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] Schema changes have a matching SQL migration in `supabase/migrations/`
      and I ran `npx prisma generate`
- [ ] New ways to change a task go through `src/lib/notifications/dispatch.ts`
- [ ] No secrets, tokens or personal data in the diff or the screenshots
