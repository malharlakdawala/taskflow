import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { asProjectColor } from "@/lib/projects";
import { buildSnippet, parseSearchTerms } from "@/lib/search/terms";
import { toPlainText } from "@/lib/utils";
import type { SearchResult, TaskPriority, TaskStatus } from "@/lib/types";

/**
 * Keyword search over every task, whatever state it is in — a finished task is
 * the one people most often come looking for, so DONE is never filtered out and
 * never demoted.
 *
 * Why raw SQL rather than a Prisma query: `description` and `Comment.content`
 * are jsonb columns, and Prisma's case-insensitive filter cannot reach into
 * them — `mode: "insensitive"` on a JSON field compiles to `lower(jsonb)`,
 * which Postgres has no such function for, and a search that only found the
 * exact case someone typed would be no search at all. So the text is unwrapped
 * with `#>> '{}'` and matched with ILIKE. Ranking then happens in the database,
 * *before* the limit: a title match cannot be pushed out of the results by a
 * more recently touched task that merely mentions the word in a comment.
 */

/** What the palette shows. One more is fetched, to know there are others. */
export const MAX_SEARCH_RESULTS = 25;

/**
 * How much text comes back per row for the snippet. Descriptions can run to
 * 100k characters and the window is centred on the match, so this is a display
 * budget rather than a limit on what is searched — matching happens over the
 * whole column, in SQL.
 */
const SNIPPET_WINDOW = 600;
const SNIPPET_LEAD = 120;

/** A jsonb string column as plain text. Absent content reads as empty. */
const asText = (column: Prisma.Sql) => Prisma.sql`coalesce(${column} #>> '{}', '')`;

const DESCRIPTION = asText(Prisma.sql`t."description"`);
const COMMENT_TEXT = Prisma.sql`coalesce(c."text", '')`;

/** `%` and `_` are wildcards to LIKE; someone searching "50%" means the character. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

interface MatchRow {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  updatedAt: Date;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  projectArchived: boolean | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  assigneeAvatarUrl: string | null;
  descriptionText: string;
  commentText: string;
  inTitle: boolean;
  inDescription: boolean;
  inComment: boolean;
  inProject: boolean;
  inAssignee: boolean;
}

export interface TaskSearchPage {
  results: SearchResult[];
  hasMore: boolean;
}

const EMPTY_PAGE: TaskSearchPage = { results: [], hasMore: false };

export async function searchTasks(query: string): Promise<TaskSearchPage> {
  const terms = parseSearchTerms(query);
  if (terms.length === 0) return EMPTY_PAGE;

  const patterns = terms.map(likePattern);
  /** The phrase as typed, for ranking an exact run in the title first. */
  const phrase = likePattern(terms.join(" "));

  const anyTerm = (expression: Prisma.Sql) =>
    Prisma.sql`(${Prisma.join(
      patterns.map((pattern) => Prisma.sql`${expression} ILIKE ${pattern}`),
      " OR "
    )})`;

  const everyTerm = (expression: Prisma.Sql) =>
    Prisma.sql`(${Prisma.join(
      patterns.map((pattern) => Prisma.sql`${expression} ILIKE ${pattern}`),
      " AND "
    )})`;

  /** The stretch of text a snippet is cut from, centred on the first keyword. */
  const window = (expression: Prisma.Sql) => Prisma.sql`
    substr(
      ${expression},
      greatest(1, position(${terms[0]} in lower(${expression})) - ${SNIPPET_LEAD}),
      ${SNIPPET_WINDOW}
    )`;

  /** Every keyword must appear somewhere in the task, in any of these places. */
  const searchable = patterns.map(
    (pattern) => Prisma.sql`(
      t."title" ILIKE ${pattern}
      OR ${DESCRIPTION} ILIKE ${pattern}
      OR coalesce(p."name", '') ILIKE ${pattern}
      OR coalesce(u."name", '') ILIKE ${pattern}
      OR coalesce(u."email", '') ILIKE ${pattern}
      OR EXISTS (
        SELECT 1
        FROM "taskflow"."Comment" cm
        WHERE cm."taskId" = t."id"
          AND ${asText(Prisma.sql`cm."content"`)} ILIKE ${pattern}
      )
    )`
  );

  const rows = await prisma.$queryRaw<MatchRow[]>`
    SELECT
      t."id",
      t."title",
      t."status"::text AS "status",
      t."priority"::text AS "priority",
      t."dueDate",
      t."updatedAt",
      t."projectId",
      p."name" AS "projectName",
      p."color" AS "projectColor",
      p."archived" AS "projectArchived",
      t."assigneeId",
      u."name" AS "assigneeName",
      u."email" AS "assigneeEmail",
      u."avatarUrl" AS "assigneeAvatarUrl",
      ${window(DESCRIPTION)} AS "descriptionText",
      ${window(COMMENT_TEXT)} AS "commentText",
      ${anyTerm(Prisma.sql`t."title"`)} AS "inTitle",
      ${anyTerm(DESCRIPTION)} AS "inDescription",
      (c."text" IS NOT NULL) AS "inComment",
      ${anyTerm(Prisma.sql`coalesce(p."name", '')`)} AS "inProject",
      ${anyTerm(
        Prisma.sql`(coalesce(u."name", '') || ' ' || coalesce(u."email", ''))`
      )} AS "inAssignee"
    FROM "taskflow"."Task" t
    LEFT JOIN "taskflow"."Project" p ON p."id" = t."projectId"
    LEFT JOIN "taskflow"."User" u ON u."id" = t."assigneeId"
    -- The newest comment that mentions any of the keywords, for the snippet.
    LEFT JOIN LATERAL (
      SELECT ${asText(Prisma.sql`cm."content"`)} AS "text"
      FROM "taskflow"."Comment" cm
      WHERE cm."taskId" = t."id"
        AND ${anyTerm(asText(Prisma.sql`cm."content"`))}
      ORDER BY cm."createdAt" DESC
      LIMIT 1
    ) c ON true
    WHERE ${Prisma.join(searchable, " AND ")}
    ORDER BY
      CASE
        WHEN t."title" ILIKE ${phrase} THEN 3
        WHEN ${everyTerm(Prisma.sql`t."title"`)} THEN 2
        WHEN ${anyTerm(Prisma.sql`t."title"`)} THEN 1
        ELSE 0
      END DESC,
      t."updatedAt" DESC
    LIMIT ${MAX_SEARCH_RESULTS + 1}
  `;

  return {
    results: rows.slice(0, MAX_SEARCH_RESULTS).map((row) => toResult(row, terms)),
    hasMore: rows.length > MAX_SEARCH_RESULTS,
  };
}

function toResult(row: MatchRow, terms: string[]): SearchResult {
  // Descriptions and comments hold Tiptap HTML; a result row wants words.
  const description = toPlainText(row.descriptionText);
  const comment = toPlainText(row.commentText);

  // The task's own words come first. A comment extract is shown when that is
  // where the keywords actually are — otherwise it would explain nothing.
  const snippetSource = row.inDescription
    ? "description"
    : row.inComment && comment
      ? "comment"
      : description
        ? "description"
        : null;

  const snippet =
    snippetSource === "comment"
      ? buildSnippet(comment, terms)
      : snippetSource === "description"
        ? buildSnippet(description, terms)
        : null;

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    project:
      row.projectId && row.projectName !== null
        ? {
            id: row.projectId,
            name: row.projectName,
            color: asProjectColor(row.projectColor),
            archived: row.projectArchived ?? false,
          }
        : null,
    assignee:
      row.assigneeId && row.assigneeEmail !== null
        ? {
            id: row.assigneeId,
            email: row.assigneeEmail,
            name: row.assigneeName,
            avatarUrl: row.assigneeAvatarUrl,
          }
        : null,
    snippet,
    snippetSource: snippet ? snippetSource : null,
    matched: {
      inTitle: row.inTitle,
      inDescription: row.inDescription,
      inComment: row.inComment,
      inProject: row.inProject,
      inAssignee: row.inAssignee,
    },
  };
}
