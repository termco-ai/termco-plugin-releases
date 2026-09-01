/**
 * Tracks whether the header should render in its compact layout, driven by a
 * `ResizeObserver` on the header root. Owns the root ref so the width-watching
 * concern lives entirely outside the header component.
 */
import { useEffect, useRef, useState } from "react";

const COMPACT_WIDTH = 900;

export function useHeaderCompact() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setCompact(w < COMPACT_WIDTH);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { rootRef, compact };
}
