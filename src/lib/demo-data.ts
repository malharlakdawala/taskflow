import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { ProjectColor } from "@/lib/types";

/**
 * The fictional workspace used by `npm run seed` and by the demo reset cron.
 *
 * Shared between the two so they cannot drift: the seed creates the accounts
 * and then calls `seedDemoContent`, and the reset re-runs only the content part
 * against accounts that already exist. That split is deliberate — recreating
 * accounts needs the Supabase service-role key, and that key must never be
 * present in a running deployment.
 *
 * Everything here is invented. example.com is reserved by the IETF precisely
 * so documentation and demos don't send mail to a real domain.
 */

export const DEMO_PEOPLE = [
  { email: "ada@example.com", name: "Ada Whitfield", role: "ADMIN" as const },
  { email: "rafael@example.com", name: "Rafael Ortiz", role: "MEMBER" as const },
  { email: "priya@example.com", name: "Priya Raman", role: "MEMBER" as const },
];

/**
 * The bodies of work the tasks below are filed under. One is archived, because
 * a workspace that has been running a while has finished projects in it, and
 * that is the state the archive flag exists for.
 */
const PROJECTS = [
  {
    name: "Watering & reminders",
    color: "blue",
    description: "Scheduling, notifications and the care calendar.",
  },
  {
    name: "Plant identification",
    color: "green",
    description:
      "The species model, the database behind it, and the sensors it leans on.",
  },
  {
    name: "App polish",
    color: "violet",
    description: "Screens, states and accessibility work in the mobile app.",
  },
  {
    name: "Platform",
    color: "slate",
    description: "Storage, performance, and everything that is not a feature.",
  },
  {
    name: "Spring launch",
    color: "amber",
    description: "Shipped in March. Kept around for reference.",
    archived: true,
  },
] as const satisfies ReadonlyArray<{
  name: string;
  color: ProjectColor;
  description: string;
  archived?: boolean;
}>;

/**
 * title, status, priority, due (days from now, null for none), assignee,
 * creator, project (index into PROJECTS, or null for deliberately unfiled)
 *
 * Two are left unfiled on purpose: unfiled is a real, permanent state rather
 * than a gap, and a demo where every task has a project would not show it.
 */
const TASKS = [
  ["Watering reminders fire twice on daylight-saving days", "IN_PROGRESS", "URGENT", -2, 1, 0, 0],
  ["Plant identification model returns low confidence indoors", "IN_PROGRESS", "HIGH", 3, 2, 0, 1],
  ["Redesign the plant detail screen", "IN_PROGRESS", "MEDIUM", 6, 0, 2, 2],
  ["Offline mode for the care calendar", "IN_PROGRESS", "MEDIUM", 12, 1, 0, 0],
  ["Onboarding: ask for light conditions before species", "IN_REVIEW", "HIGH", 2, 2, 0, 2],
  ["Species database import from Trefle", "TODO", "HIGH", 8, 1, 0, 1],
  ["Push notification copy needs a pass", "TODO", "MEDIUM", 9, 0, 1, 0],
  ["Add a 'skip this week' action to reminders", "TODO", "MEDIUM", 14, 2, 0, 0],
  ["Empty state for someone with no plants yet", "TODO", "LOW", null, 0, 2, 2],
  ["Accessibility audit of the watering flow", "TODO", "HIGH", 5, 2, 0, 2],
  ["Support for succulent watering schedules", "TODO", "LOW", 21, 1, 2, 0],
  ["Investigate battery drain on Android 15", "TODO", "URGENT", 1, 1, 0, 3],
  ["Weekly digest email template", "TODO", "MEDIUM", 16, 0, 0, 0],
  ["Migrate photo storage off the legacy bucket", "TODO", "LOW", null, 2, 0, 3],
  ["Light sensor calibration for older devices", "BACKLOG", "LOW", null, 1, 0, 1],
  ["Community plant-swap board", "BACKLOG", "NONE", null, 0, 2, null],
  ["Seasonal care tips content plan", "BACKLOG", "LOW", null, 2, 1, null],
  ["Ship the repotting reminder", "DONE", "HIGH", -8, 1, 0, 4],
  ["Fix crash when a photo has no EXIF data", "DONE", "URGENT", -12, 2, 0, 4],
  ["Dark mode for the plant list", "DONE", "MEDIUM", -20, 0, 1, 2],
] as const;

const HERO = "Redesign the plant detail screen";

const HERO_DESCRIPTION =
  "<h3>Goal</h3><p>The detail screen has grown by accretion — care history, " +
  "notes, photos and the watering schedule are all competing for the top of " +
  "the page. Nobody scrolls past the fold.</p>" +
  "<h3>What changes</h3><ul>" +
  "<li>Watering schedule moves into the header, beside the species name.</li>" +
  "<li>Care history collapses to the last three entries, expandable.</li>" +
  "<li>Photos become a strip rather than a grid.</li></ul>" +
  "<p>Open questions are in the comments. <strong>Not</strong> in scope: the " +
  "species picker, which Priya is already rethinking.</p>";

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000);

/**
 * Removes everything the demo owns. Tasks cascade to their comments,
 * attachments and notifications, so the explicit deletes afterwards only cover
 * rows that hang off a user rather than a task.
 */
export async function clearDemoContent(prisma: PrismaClient): Promise<void> {
  await prisma.task.deleteMany({});
  // After the tasks, so this is never the delete that orphans anything.
  await prisma.project.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.apiToken.deleteMany({});
  // A demo publishes its admin password, so anyone can leave invitations behind
  // in the settings screen. They send no mail there, but they should not
  // accumulate either — and a stale link is one a reset ought to break.
  await prisma.invitation.deleteMany({});
}

/**
 * Creates the tasks, comments and notifications. `ids` must be the demo
 * members' ids in the same order as DEMO_PEOPLE.
 */
export async function seedDemoContent(
  prisma: PrismaClient,
  ids: string[]
): Promise<{ tasks: number; comments: number; projects: number }> {
  const byTitle = new Map<string, string>();
  let order = 1000;

  // Projects first: the tasks reference them by index.
  const projectIds: string[] = [];
  for (const project of PROJECTS) {
    const created = await prisma.project.create({
      data: {
        name: project.name,
        description: project.description,
        color: project.color,
        archived: "archived" in project ? project.archived : false,
        createdById: ids[0],
      },
      select: { id: true },
    });
    projectIds.push(created.id);
  }

  for (const [
    title,
    status,
    priority,
    due,
    assignee,
    creator,
    project,
  ] of TASKS) {
    const task = await prisma.task.create({
      data: {
        title,
        status,
        priority,
        dueDate: due === null ? null : daysFromNow(due),
        order: (order += 1000),
        assigneeId: ids[assignee],
        createdById: ids[creator],
        projectId: project === null ? null : projectIds[project],
        ...(title === HERO && { description: HERO_DESCRIPTION }),
      },
      select: { id: true },
    });
    byTitle.set(title, task.id);
  }

  const hero = byTitle.get(HERO)!;
  const comments: Array<[string, number, string]> = [
    [hero, 2, "<p>Mocked up the header version. Moving the schedule up top means the species name has to truncate on small screens — I think that's the right trade, but worth a second opinion.</p>"],
    [hero, 1, "<p>Agreed on the trade. One thing: the care history collapse should remember its state per plant, otherwise it's annoying for anyone with a big collection.</p>"],
    [hero, 0, "<p>Good catch. Added that to the acceptance criteria — <em>expanded state persists per plant</em>.</p>"],
    [byTitle.get("Watering reminders fire twice on daylight-saving days")!, 2, "<p>Reproduced it. The scheduler stores local times and re-resolves them at fire time, so the hour that repeats gets two notifications.</p>"],
    [byTitle.get("Investigate battery drain on Android 15")!, 1, "<p>Profiler says it's the light sensor polling at 1Hz in the background. Should be event-driven.</p>"],
  ];

  for (const [taskId, author, content] of comments) {
    await prisma.comment.create({
      data: { content, taskId, authorId: ids[author] },
    });
  }

  // Enough unread for the bell to have something to show.
  await prisma.notification.createMany({
    data: [
      {
        userId: ids[0], actorId: ids[2], type: "TASK_COMMENT",
        title: "Priya Raman commented on “Redesign the plant detail screen”",
        body: "Mocked up the header version. Moving the schedule up top means the species name has to truncate…",
        url: `/tasks/${hero}`, taskId: hero,
      },
      {
        userId: ids[0], actorId: ids[1], type: "TASK_ASSIGNED",
        title: "Rafael Ortiz assigned you “Push notification copy needs a pass”",
        body: "Status: To Do · Priority: Medium",
        url: `/tasks/${byTitle.get("Push notification copy needs a pass")}`,
        taskId: byTitle.get("Push notification copy needs a pass"),
      },
      {
        userId: ids[0], actorId: ids[2], type: "TASK_UPDATED",
        title: "Priya Raman updated “Onboarding: ask for light conditions before species”",
        body: "Status → In Review",
        url: `/tasks/${byTitle.get("Onboarding: ask for light conditions before species")}`,
        taskId: byTitle.get("Onboarding: ask for light conditions before species"),
      },
      {
        userId: ids[0], type: "TASK_DUE_SOON",
        title: "“Watering reminders fire twice on daylight-saving days” is overdue",
        body: "Was due two days ago",
        url: `/tasks/${byTitle.get("Watering reminders fire twice on daylight-saving days")}`,
        taskId: byTitle.get("Watering reminders fire twice on daylight-saving days"),
      },
    ],
  });

  return {
    tasks: TASKS.length,
    comments: comments.length,
    projects: PROJECTS.length,
  };
}
