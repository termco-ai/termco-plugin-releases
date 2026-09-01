/** Source-owned by the coding-agent-native plugin.
 * Keep a scroll container pinned to the bottom as new content streams in — but
 * only while the user is already at the bottom, so scrolling up to read history
 * isn't yanked back down. Exposes `atBottom` to drive a scroll-to-bottom button.
 */

import { useCallback, useLayoutEffect, useRef, useState } from "react";

const NEAR_BOTTOM_PX = 48;

export function useStickyScroll(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const near =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stick.current = near;
    setAtBottom(near);
  }, []);

  // Pin to the bottom BEFORE the browser paints (useLayoutEffect), so opening a
  // transcript lands at the bottom instantly instead of flashing at the top and
  // then jumping. `dep` (the message list) is the change trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `dep` is the change trigger
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [dep]);

  const scrollToBottom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stick.current = true;
    setAtBottom(true);
  }, []);

  return { ref, atBottom, onScroll, scrollToBottom };
}
