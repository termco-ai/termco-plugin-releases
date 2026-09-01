// The `#` mode: full-text matches from the workspace grep, each row showing the
// file icon, the matched line, and its `path:line` location.

import type { WorkspaceFileIconsCapability } from "@termco/files-base";
import { CommandGroup, CommandItem } from "../../ui";
import type { AsyncQueryState } from "../hooks/useAsyncQuery";
import {
  CONTENT_SEARCH_MIN_QUERY,
  type ContentHit,
} from "../hooks/useContentSearch";
import { basename } from "../lib/paths";
import { AsyncBody } from "./AsyncBody";
import { StatusItem } from "./StatusItem";

/**
 * Render the content-search results (or the appropriate guidance/status).
 *
 * @param workspaceRoot Active workspace root, or `null` when none is open.
 * @param term Trimmed query term used to gate the minimum-length prompt.
 * @param content Async query state from `useContentSearch`.
 * @param onOpen Invoked with a hit's path and line to reveal it.
 */
export function ContentSearchView({
  workspaceRoot,
  term,
  content,
  onOpen,
  fileIcons,
}: {
  workspaceRoot: string | null;
  term: string;
  content: AsyncQueryState<ContentHit>;
  onOpen: (path: string, line: number) => void;
  fileIcons: WorkspaceFileIconsCapability;
}) {
  return (
    <CommandGroup heading="Contents">
      {!workspaceRoot ? (
        <StatusItem label="No workspace root" />
      ) : term.length < CONTENT_SEARCH_MIN_QUERY ? (
        <StatusItem label="Type at least 2 characters" />
      ) : (
        <AsyncBody
          loading={content.loading}
          error={content.error}
          empty={content.results.length === 0}
          emptyLabel="No matches"
          onRetry={content.retry}
        >
          {content.results.map((hit) => (
            <CommandItem
              key={`${hit.path}:${hit.line}`}
              value={`content:${hit.path}:${hit.line}`}
              onSelect={() => onOpen(hit.path, hit.line)}
              className="gap-3 rounded-lg! px-3 py-2 text-sm data-selected:bg-primary/10"
            >
              <img
                src={fileIcons.fileIconUrl(basename(hit.rel))}
                alt=""
                className="size-4 shrink-0"
              />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {hit.text.trim()}
              </span>
              <span className="ml-auto max-w-64 shrink-0 truncate font-mono text-xs font-normal text-muted-foreground">
                {hit.rel}:{hit.line}
              </span>
            </CommandItem>
          ))}
        </AsyncBody>
      )}
    </CommandGroup>
  );
}
