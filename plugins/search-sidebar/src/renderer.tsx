import { WORKSPACE_FILES_SERVICE, type WorkspaceFilesCapability } from "@termco/files-base";
import type { PluginModule } from "@termco/kernel";
import {
  UI_SIDEBAR_VIEWS_SERVICE,
  type UiSidebarViewContribution,
  type UiSidebarViewProps,
  type UiSidebarViewRegistry,
} from "@termco/ui-sidebar-base";
import ui from "@termco/ui";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  basename,
  contentHits,
  CONTENT_SEARCH_DEBOUNCE_MS,
  CONTENT_SEARCH_LIMIT,
  CONTENT_SEARCH_MIN_QUERY,
  type ContentHit,
} from "./search";

const { useEffect, useRef, useState } = ui.React;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createSearchPanel(files: WorkspaceFilesCapability) {
  return function WorkspaceSearch({ rootPath, workspace, openFileAt }: UiSidebarViewProps) {
    const [query, setQuery] = useState("");
    const [retry, setRetry] = useState(0);
    const [hits, setHits] = useState<ContentHit[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const input = useRef<HTMLInputElement | null>(null);
    const term = query.trim();

    useEffect(() => { input.current?.focus(); }, []);
    useEffect(() => {
      if (!rootPath || term.length < CONTENT_SEARCH_MIN_QUERY) {
        setHits([]);
        setLoading(false);
        setError(null);
        return;
      }
      let active = true;
      const timer = setTimeout(() => {
        setLoading(true);
        setError(null);
        void files.grepInteractive({
          pattern: term,
          root: rootPath,
          maxResults: CONTENT_SEARCH_LIMIT,
        }, workspace).then((result) => {
          if (active) setHits(contentHits(result));
        }).catch((cause) => {
          if (active) { setHits([]); setError(message(cause)); }
        }).finally(() => {
          if (active) setLoading(false);
        });
      }, CONTENT_SEARCH_DEBOUNCE_MS);
      return () => { active = false; clearTimeout(timer); };
    }, [files, retry, rootPath, term, workspace]);

    return <div data-testid="workspace-search-sidebar" className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center border-b border-border/40 px-3.5">
        <span className="text-xs font-semibold tracking-wider text-muted-foreground">
          SEARCH IN FILES
        </span>
      </div>
      <div className="shrink-0 p-3">
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-2">
          <HugeiconsIcon
            icon={Search01Icon}
            size={14}
            strokeWidth={1.75}
            className="shrink-0 text-muted-foreground"
          />
          <input
            ref={input}
            aria-label="Search file contents"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search file contents…"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!rootPath ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">No workspace root.</p>
        ) : term.length < CONTENT_SEARCH_MIN_QUERY ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Type at least {CONTENT_SEARCH_MIN_QUERY} characters to search file contents.
          </p>
        ) : error ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            <p className="truncate">Search failed: {error}</p>
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
              className="mt-1 cursor-pointer text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Searching…</p>
        ) : hits.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No matches</p>
        ) : (
          hits.map((hit) => (
            <button
              key={`${hit.path}:${hit.line}`}
              type="button"
              onClick={() => openFileAt(hit.path, hit.line)}
              className="block w-full cursor-pointer rounded-lg p-2 text-left hover:bg-accent"
            >
              <span
                className="flex min-w-0 items-baseline gap-1"
                title={`${hit.rel}:${hit.line}`}
              >
                <span className="min-w-0 truncate text-xs text-foreground">
                  {basename(hit.rel)}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  :{hit.line}
                </span>
              </span>
              <span className="block truncate pl-1 font-mono text-xs text-muted-foreground">
                {hit.text.trim()}
              </span>
            </button>
          ))
        )}
      </div>
    </div>;
  };
}

const plugin: PluginModule = {
  inject: [
    WORKSPACE_FILES_SERVICE,
    UI_SIDEBAR_VIEWS_SERVICE,
  ],
  async activate(context) {
    const contribution: UiSidebarViewContribution = {
      id: "search",
      label: "Search in files",
      description: "Search file contents in the active workspace.",
      order: 10,
      icon: Search01Icon,
      Component: createSearchPanel(context.get<WorkspaceFilesCapability>("workspace.files")),
    };
    await context.effect(() =>
      context
        .get<UiSidebarViewRegistry>(UI_SIDEBAR_VIEWS_SERVICE)
        .register(contribution, { pluginId: "search-sidebar", generation: context.generation, key: "search" }),
    );
  },
};

export default plugin;
