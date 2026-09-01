/**
 * Lazy boundary for {@link EditorStack}: code-splits the CodeMirror editor
 * bundle so it only loads once a file is actually opened.
 */
import type { ComponentProps } from "react";
import { lazy, Suspense } from "react";
import type { EditorStack as EditorStackType } from "./EditorStack";

const EditorStackInner = lazy(() =>
  import("./EditorStack").then((m) => ({ default: m.EditorStack })),
);

type Props = ComponentProps<typeof EditorStackType>;

export function EditorStack(props: Props) {
  return (
    <Suspense fallback={null}>
      <EditorStackInner {...props} />
    </Suspense>
  );
}
