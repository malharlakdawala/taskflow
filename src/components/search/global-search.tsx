"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Loader2,
  MessageSquare,
  Search,
  TriangleAlert,
  User as UserIcon,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandItem,
  CommandInput,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { StatusDot, PriorityBadge } from "@/components/tasks/status-badge";
import { ProjectBadge, ProjectDot } from "@/components/projects/project-badge";
import { useProjects } from "@/lib/use-projects";
import {
  MIN_SEARCH_LENGTH,
  highlightSegments,
  matchesAllTerms,
  parseSearchTerms,
} from "@/lib/search/terms";
import { cn, displayName } from "@/lib/utils";
import { STATUS_ITEMS } from "@/lib/types";
import type { SearchResponse, SearchResult } from "@/lib/types";

/**
 * Search across every task in the workspace, whatever state it is in.
 *
 * A palette rather than a field in a header: search is the one thing that has
 * to be reachable from every screen without first navigating somewhere, and the
 * keyboard is how people who search a lot open it. The sidebar trigger is there
 * so it is discoverable by people who don't know that yet.
 *
 * Matching happens on the server — descriptions and comments are not loaded
 * client-side, and finished work is exactly what tends to be worth finding.
 */

/** Long enough that typing a word doesn't fire a request per keystroke. */
const DEBOUNCE_MS = 180;

/** Projects are already in memory; more than a few would bury the tasks. */
const MAX_PROJECT_MATCHES = 4;

/**
 * The platform's own modifier key, read through useSyncExternalStore rather than
 * an effect: `navigator` does not exist while rendering on the server, and this
 * is the one way to render a browser-only value without either a hydration
 * mismatch or a state write on mount. It never changes, so there is nothing to
 * subscribe to.
 */
const noSubscription = () => () => {};
const isMacBrowser = () => /mac|iphone|ipad/i.test(navigator.userAgent);
/** The server has no platform to speak of; the client corrects it on hydration. */
const isMacServer = () => false;

/** One answer from the search endpoint, tagged with the query that asked for it. */
interface Answer {
  query: string;
  results: SearchResult[];
  hasMore: boolean;
  error: string | null;
}

export function GlobalSearch() {
  const router = useRouter();
  const { projects } = useProjects();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  /**
   * The newest answer from the endpoint, whatever it was asked. Everything the
   * palette shows is derived from it and the query as it now stands, so nothing
   * has to be reset when the query changes — a search in flight simply has no
   * matching answer yet.
   */
  const [answer, setAnswer] = useState<Answer | null>(null);

  const isMac = useSyncExternalStore(noSubscription, isMacBrowser, isMacServer);
  const shortcut = isMac ? "⌘K" : "Ctrl K";

  const trimmed = query.trim();
  const terms = useMemo(() => parseSearchTerms(trimmed), [trimmed]);
  const isTooShort = trimmed.length < MIN_SEARCH_LENGTH;

  /** Only an answer to the question currently being asked counts as one. */
  const current = !isTooShort && answer?.query === trimmed ? answer : null;
  /** Keep the last results on screen while the next ones are on their way. */
  const stale = !isTooShort && current === null ? answer : null;
  const shown = current ?? stale;
  const results = shown?.results ?? [];
  const hasMore = shown?.hasMore ?? false;
  const error = current?.error ?? null;
  const isSearching = !isTooShort && current === null;

  /**
   * Closing clears the query and the answer with it, so the palette always
   * opens on a blank field. Reopening onto an old query would mean showing
   * results fetched at some earlier point, which is the one kind of staleness a
   * search cannot afford.
   */
  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setQuery("");
      setAnswer(null);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        // Chrome's own address-bar shortcut, taken over deliberately: inside an
        // app, ⌘K means "find something in here".
        event.preventDefault();
        setOpen(!isOpen);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // isOpen is a dependency so the toggle reads the current state rather than
    // whatever it was when the listener was first attached.
  }, [isOpen, setOpen]);

  useEffect(() => {
    if (!isOpen || isTooShort || current !== null) return;

    const controller = new AbortController();

    // Fired from the timer rather than from the effect body, which is both the
    // debounce — a fast typist makes one request, not one per keystroke — and
    // the reason no state is written while the effect itself runs.
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error("Search failed");

        const payload: SearchResponse = await response.json();
        setAnswer({
          query: trimmed,
          results: payload.results,
          hasMore: payload.hasMore,
          error: null,
        });
      } catch (failure) {
        // An aborted request is the previous keystroke being tidied up, not a
        // failure worth showing anyone.
        if (controller.signal.aborted) return;
        console.error("Search failed:", failure);
        setAnswer({
          query: trimmed,
          results: [],
          hasMore: false,
          error: "Could not search just now",
        });
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [isOpen, trimmed, isTooShort, current]);

  /** Project names are in memory already, so those matches cost nothing. */
  const projectMatches = useMemo(() => {
    if (terms.length === 0) return [];
    return projects
      .filter((project) => matchesAllTerms(project.name, terms))
      .slice(0, MAX_PROJECT_MATCHES);
  }, [projects, terms]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router, setOpen]
  );

  const isEmpty =
    !isTooShort && !isSearching && !error && results.length === 0 && projectMatches.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-9 w-full items-center gap-2.5 rounded-lg border border-input/60 bg-background/50 px-2.5",
          "text-sm text-muted-foreground transition-colors",
          "hover:border-input hover:bg-background hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        )}
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Search tasks…</span>
        <kbd className="ml-auto shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {shortcut}
        </kbd>
      </button>

      <CommandDialog
        open={isOpen}
        onOpenChange={setOpen}
        title="Search tasks"
        description="Find any task by keyword — titles, descriptions, comments, projects and people, in every status including done."
        className="top-[12vh] sm:max-w-2xl"
      >
        <Command shouldFilter={false} loop label="Search tasks">
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search every task — titles, descriptions, comments, people…"
          />

          <CommandList className="max-h-[24rem]">
            {isTooShort && (
              <Hint>
                {trimmed.length === 0
                  ? "Type a keyword. Every status is searched, finished tasks included — put \"quotes around a phrase\" to match it exactly."
                  : `Keep going — searching starts at ${MIN_SEARCH_LENGTH} characters.`}
              </Hint>
            )}

            {error && (
              <Hint>
                <TriangleAlert className="mr-1.5 inline h-3.5 w-3.5 -translate-y-px text-destructive" />
                {error}
              </Hint>
            )}

            {isEmpty && (
              <Hint>
                Nothing matches <Quoted>{trimmed}</Quoted>. Fewer or shorter
                keywords usually finds it.
              </Hint>
            )}

            {projectMatches.length > 0 && (
              <CommandGroup heading="Projects">
                {projectMatches.map((project) => (
                  <CommandItem
                    key={project.id}
                    value={`project:${project.id}`}
                    onSelect={() => go(`/list?project=${project.id}`)}
                  >
                    <ProjectDot color={project.color} />
                    <span className="min-w-0 truncate">
                      <Highlighted text={project.name} terms={terms} />
                    </span>
                    <CommandShortcut className="tracking-normal">
                      {project.archived && "archived · "}
                      {project.taskCount}{" "}
                      {project.taskCount === 1 ? "task" : "tasks"}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.length > 0 && (
              <CommandGroup
                heading={`Tasks${hasMore ? ` (first ${results.length})` : ""}`}
              >
                {results.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    terms={terms}
                    onSelect={() => go(`/tasks/${task.id}`)}
                  />
                ))}
              </CommandGroup>
            )}

            {results.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value="open-in-list"
                    onSelect={() => go(`/list?q=${encodeURIComponent(trimmed)}`)}
                  >
                    <ArrowRight />
                    <span>
                      {hasMore
                        ? "There are more — open the list filtered to these keywords"
                        : "Open the list filtered to these keywords"}
                    </span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>

          <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              {isSearching && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
              {isSearching
                ? "Searching…"
                : results.length > 0
                  ? `${results.length}${hasMore ? "+" : ""} ${
                      results.length === 1 ? "task" : "tasks"
                    } · every status, done included`
                  : "Titles, descriptions, comments, projects and people"}
            </span>
            <span className="flex shrink-0 items-center gap-2.5">
              <Key>↑↓</Key>
              <Key>↵</Key>
              <span>open</span>
              <Key>esc</Key>
            </span>
          </div>
        </Command>
      </CommandDialog>
    </>
  );
}

function TaskRow({
  task,
  terms,
  onSelect,
}: {
  task: SearchResult;
  terms: string[];
  onSelect: () => void;
}) {
  const isDone = task.status === "DONE";
  /**
   * The keywords are somewhere in this task, but not always anywhere visible —
   * a match on the assignee or the project name is worth saying out loud, or
   * the row looks like it was returned by mistake.
   */
  const onlyMetadata =
    !task.matched.inTitle &&
    !task.matched.inDescription &&
    !task.matched.inComment;

  return (
    <CommandItem value={task.id} onSelect={onSelect} className="items-start py-2">
      <StatusDot status={task.status} className="mt-1.5" />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "min-w-0 truncate text-sm font-medium",
              isDone && "text-muted-foreground line-through decoration-1"
            )}
          >
            <Highlighted text={task.title} terms={terms} />
          </span>
          <PriorityBadge
            priority={task.priority}
            showLabel={false}
            className="shrink-0"
          />
        </div>

        {task.snippet && (
          <p className="mt-0.5 truncate text-xs leading-relaxed text-muted-foreground">
            {task.snippetSource === "comment" && (
              <MessageSquare className="mr-1 inline h-3 w-3 -translate-y-px" />
            )}
            <Highlighted text={task.snippet} terms={terms} />
          </p>
        )}

        {onlyMetadata && task.matched.inAssignee && task.assignee && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            <UserIcon className="mr-1 inline h-3 w-3 -translate-y-px" />
            Assigned to <Highlighted
              text={displayName(task.assignee)}
              terms={terms}
            />
          </p>
        )}
      </div>

      {/* Trailing metadata. Marked as a shortcut slot so the item's check mark
          stays out of the way — nothing here is selectable. */}
      <CommandShortcut className="flex shrink-0 items-center gap-2 tracking-normal">
        {task.project && (
          <ProjectBadge project={task.project} className="max-w-[9rem]" />
        )}
        <span className="w-[4.5rem] whitespace-nowrap text-right font-medium">
          {STATUS_ITEMS[task.status]}
        </span>
      </CommandShortcut>
    </CommandItem>
  );
}

/** The searched-for words, marked in whatever text they were found in. */
function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  const segments = useMemo(() => highlightSegments(text, terms), [text, terms]);

  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark
            key={index}
            className="rounded-sm bg-primary/15 px-0.5 text-foreground"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-6 text-center text-xs leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

function Quoted({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">“{children}”</span>;
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px] font-medium leading-none">
      {children}
    </kbd>
  );
}
