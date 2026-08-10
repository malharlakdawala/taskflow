/**
 * Keyword parsing, snippet extraction and match highlighting.
 *
 * Deliberately free of server imports: the search endpoint matches on these
 * terms, the palette highlights the same terms in what comes back, and the list
 * view filters the tasks it already holds by the same rules. One definition of
 * "what the words in this query are" keeps those three in agreement.
 */

/**
 * A single character matches most of a workspace, so the endpoint answers an
 * empty result set below this rather than shipping everything back.
 */
export const MIN_SEARCH_LENGTH = 2;

/** Past this each extra word costs another pass over every description. */
const MAX_TERMS = 6;

/** A quoted run, or a bare word. */
const TERM_PATTERN = /"([^"]*)"|(\S+)/g;

/** How much of the text leads up to the keyword in a snippet. */
const SNIPPET_LEAD = 60;
/** Roughly two lines at the width the palette renders them. */
const SNIPPET_LENGTH = 180;

/**
 * The distinct keywords in a query, lower-cased.
 *
 * A quoted run stays one term, so `"due next week"` is a phrase to find rather
 * than three words that may sit anywhere in the task.
 */
export function parseSearchTerms(query: string): string[] {
  const terms: string[] = [];

  for (const match of query.matchAll(TERM_PATTERN)) {
    const term = (match[1] ?? match[2]).trim().toLowerCase();
    if (term && !terms.includes(term)) terms.push(term);
    if (terms.length === MAX_TERMS) break;
  }

  return terms;
}

/** Every keyword has to appear somewhere — the same AND the SQL applies. */
export function matchesAllTerms(haystack: string, terms: string[]): boolean {
  const lower = haystack.toLowerCase();
  return terms.every((term) => lower.includes(term));
}

/**
 * A one-line extract of `text` centred on the first keyword in it.
 *
 * Falls back to the opening words when no keyword is present, which is what a
 * task matched by its title alone gets: still the most useful preview of it.
 */
export function buildSnippet(
  text: string | null | undefined,
  terms: string[]
): string | null {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean === "") return null;

  const lower = clean.toLowerCase();
  const hit = terms.reduce((earliest, term) => {
    const index = lower.indexOf(term);
    if (index === -1) return earliest;
    return earliest === -1 || index < earliest ? index : earliest;
  }, -1);

  let from = hit === -1 ? 0 : Math.max(0, hit - SNIPPET_LEAD);
  let to = Math.min(clean.length, from + SNIPPET_LENGTH);

  // Start and end on whole words, but never skip past the keyword itself
  // chasing a word boundary.
  if (from > 0) {
    const space = clean.indexOf(" ", from);
    if (space !== -1 && space < (hit === -1 ? to : hit)) from = space + 1;
  }
  if (to < clean.length) {
    const space = clean.lastIndexOf(" ", to);
    if (space > from) to = space;
  }

  const lead = from > 0 ? "…" : "";
  const tail = to < clean.length ? "…" : "";
  return `${lead}${clean.slice(from, to)}${tail}`;
}

export interface TextSegment {
  text: string;
  /** True for the runs that matched a keyword, which is what gets marked. */
  match: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits text into plain and matching runs so a result row can mark the words
 * that were searched for. Case is preserved: what is shown is what was stored.
 */
export function highlightSegments(text: string, terms: string[]): TextSegment[] {
  if (terms.length === 0) return [{ text, match: false }];

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const keywords = new Set(terms);

  // Splitting on a capturing group keeps the matches in the output. A run only
  // equals a keyword if it *was* one of them, so no parity bookkeeping needed.
  return text
    .split(pattern)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, match: keywords.has(part.toLowerCase()) }));
}
