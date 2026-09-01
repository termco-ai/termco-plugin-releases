import type { UiTabDescriptor } from "@termco/ui-tabs-base";
import { lazy, Suspense } from "react";

const ContainerDetailStackInner = lazy(() =>
  import("./ContainerDetailStack").then((m) => ({
    default: m.ContainerDetailStack,
  })),
);

/** Lazy wrapper for the per-container detail tab stack. */
export function ContainerDetailStackView(props: {
  tabs: readonly UiTabDescriptor[];
  activeId: number;
}) {
  return (
    <Suspense fallback={null}>
      <ContainerDetailStackInner {...props} />
    </Suspense>
  );
}
