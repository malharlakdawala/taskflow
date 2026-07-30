/**
 * Fills a TaskFlow database with a believable, entirely fictional workspace.
 *
 *   npm run seed              # add the demo data
 *   npm run seed -- --reset   # delete it first, then add it back
 *   npm run seed -- --force   # proceed even if the database has other members
 *
 * Why this needs the service-role key when the app does not: members are
 * normally created by Supabase Auth signing someone up, and the
 * `on_auth_user_created` trigger mirrors them into `taskflow."User"`. A script
 * has no browser to sign up with, so it asks the Auth admin API instead. That
 * key is read here and nowhere else — it must never reach the running app,
 * where it would bypass row level security entirely.
 *
 * Safety: refuses to touch a database containing members it did not create.
 * Losing a real workspace to a seed script is a bad afternoon.
 */

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  DEMO_PEOPLE,
  clearDemoContent,
  seedDemoContent,
} from "../src/lib/demo-data";

const RESET = process.argv.includes("--reset");
const FORCE = process.argv.includes("--force");

function required(name: string, hint: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`\n${name} is not set.\n\n${hint}\n`);
    process.exit(1);
  }
  return value;
}

const DATABASE_URL = required("DATABASE_URL", "See .env.example.");
const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL", "See .env.example.");
const SERVICE_ROLE_KEY = required(
  "SUPABASE_SERVICE_ROLE_KEY",
  "Supabase → Project Settings → API → service_role.\n" +
    "Set it for seeding only. The app itself must never have it."
);

const DEMO_PASSWORD = process.env.DEMO_PASSWORD?.trim() || "taskflow-demo";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }, { schema: "taskflow" }),
});
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const emails = DEMO_PEOPLE.map((p) => p.email);
  const total = await prisma.user.count();
  const mine = await prisma.user.count({ where: { email: { in: emails } } });

  if (total > mine && !FORCE) {
    console.error(
      `\nThis database has ${total - mine} member(s) this script did not create.\n` +
        "Refusing to touch it. Pass --force if you are certain.\n"
    );
    process.exit(1);
  }

  if (RESET || mine > 0) {
    console.log("Clearing previous demo data…");
    await clearDemoContent(prisma);
    for (const email of emails) {
      const found = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (!found) continue;
      // Deleting the auth user cascades to taskflow."User".
      const { error } = await supabase.auth.admin.deleteUser(found.id);
      if (error) await prisma.user.delete({ where: { id: found.id } });
    }
  }

  console.log("Creating members…");
  const ids: string[] = [];
  for (const person of DEMO_PEOPLE) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: person.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { name: person.name },
    });
    if (error || !data.user) {
      throw new Error(`Could not create ${person.email}: ${error?.message}`);
    }
    ids.push(data.user.id);
  }

  // The trigger makes whoever arrives first an active admin and everyone else
  // PENDING. Approve the rest, or two of the three could not sign in.
  for (const [index, person] of DEMO_PEOPLE.entries()) {
    await prisma.user.update({
      where: { id: ids[index] },
      data: {
        name: person.name,
        role: person.role,
        status: "ACTIVE",
        approvedAt: new Date(),
        approvedById: ids[0],
      },
    });
  }

  console.log("Creating projects, tasks and comments…");
  const { tasks, comments, projects } = await seedDemoContent(prisma, ids);

  console.log(
    `\nDone — ${DEMO_PEOPLE.length} members, ${projects} projects, ${tasks} tasks, ` +
      `${comments} comments.\n\n` +
      "Sign in as any of:\n" +
      DEMO_PEOPLE.map((p) => `  ${p.email}  /  ${DEMO_PASSWORD}`).join("\n") +
      `\n\n${DEMO_PEOPLE[0].email} is the admin.\n`
  );
}

main()
  .catch((error) => {
    console.error("\nSeed failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
