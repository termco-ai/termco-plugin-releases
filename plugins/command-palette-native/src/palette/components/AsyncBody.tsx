// Shared state machine for the async search modes (content + history):
// renders error/retry, loading, and empty states, or the results otherwise.

import { CommandItem } from "../../ui";
import { StatusItem } from "./StatusItem";

/**
 * Render the appropriate body for an async query's current state.
 *
 * Precedence: error (with a retry row) → still-loading-with-no-results →
 * empty → the provided `children` (the actual result rows).
 *
 * @param loading Whether a request is in flight.
 * @param error Error message, or `null` when the last request succeeded.
 * @param empty Whether there are currently zero results.
 * @param emptyLabel Message shown when settled with no results.
 * @param onRetry Invoked from the retry row after an error.
 * @param children Result rows, rendered only when settled and non-empty.
 */
export function AsyncBody({
  loading,
  error,
  empty,
  emptyLabel,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyLabel: string;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (error) {
    return (
      <>
        <StatusItem label="Search failed" tone="error" />
        <CommandItem value="retry" onSelect={onRetry} className="text-xs">
          <span>Retry</span>
        </CommandItem>
      </>
    );
  }
  if (empty && loading) return <StatusItem label="Searching..." />;
  if (empty) return <StatusItem label={emptyLabel} />;
  return <>{children}</>;
}
