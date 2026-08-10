import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth";
import { MIN_SEARCH_LENGTH } from "@/lib/search/terms";
import { searchTasks } from "@/lib/search/tasks";
import type { SearchResponse } from "@/lib/types";

/** Longer than any keyword search; past this the caller is not searching. */
const MAX_QUERY_LENGTH = 200;

export async function GET(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const query = (new URL(request.url).searchParams.get("q") ?? "")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);

  // Too short is not a client error — it is what every search looks like after
  // the first keystroke. An empty result set is the honest answer, and it keeps
  // the palette from having to special-case a 400 while someone is still typing.
  if (query.length < MIN_SEARCH_LENGTH) {
    return NextResponse.json({
      query,
      results: [],
      hasMore: false,
    } satisfies SearchResponse);
  }

  const { results, hasMore } = await searchTasks(query);

  return NextResponse.json({ query, results, hasMore } satisfies SearchResponse);
}
