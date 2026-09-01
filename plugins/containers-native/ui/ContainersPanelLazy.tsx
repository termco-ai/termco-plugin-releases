import { lazy, Suspense } from "react";

const ContainersPanelInner = lazy(() =>
  import("./ContainersPanel").then((m) => ({ default: m.ContainersPanel })),
);

/** Lazy wrapper so the containers panel (and its dialogs) load on demand. */
export function ContainersPanel() {
  return (
    <Suspense fallback={null}>
      <ContainersPanelInner />
    </Suspense>
  );
}
