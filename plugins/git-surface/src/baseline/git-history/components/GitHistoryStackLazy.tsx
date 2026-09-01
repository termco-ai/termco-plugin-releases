/**
 * Code-splitting boundary for the git-history feature: lazily loads the real
 * {@link GitHistoryStack} so the commit-graph and diff machinery stay out of
 * the startup bundle until a history tab is opened.
 */
import type { ComponentProps } from "react";
import { lazy, Suspense } from "react";
import type { GitHistoryStack as GitHistoryStackType } from "./GitHistoryStack";

const GitHistoryStackInner = lazy(() =>
  import("./GitHistoryStack").then((m) => ({ default: m.GitHistoryStack })),
);

type Props = ComponentProps<typeof GitHistoryStackType>;

export function GitHistoryStack(props: Props) {
  return (
    <Suspense fallback={null}>
      <GitHistoryStackInner {...props} />
    </Suspense>
  );
}
