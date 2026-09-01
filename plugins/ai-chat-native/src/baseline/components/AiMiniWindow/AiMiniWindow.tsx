/**
 * The floating, draggable, resizable AI mini-window. Owns its geometry and the
 * Escape-to-close behavior, and swaps between the live `Body` and the loading
 * `EmptyShell` depending on whether a session is active.
 */

import { cn, useOverlayGuard, type PresenceState } from "@termco/ui";
import { useEffect } from "react";
import { useMiniWindowGeometry } from "../../lib/useMiniWindowGeometry";
import { useChatStore } from "../../store/chatStore";
import { PlanDiffReview } from "../PlanDiffReview";
import { Body, EmptyShell } from "./Body";
import { RESIZE_DIRS, ResizeHandle } from "./ResizeHandle";

export function AiMiniWindow({ state }: { state: PresenceState }) {
  const { ref, onHeaderPointerDown, startResize } = useMiniWindowGeometry();
  // Native views (embedded browser) paint above the DOM. Register this window's
  // ref so a browser view hides only while the window actually overlaps it —
  // moving the window off the browser no longer blanks the page.
  useOverlayGuard(ref);
  const closeMini = useChatStore((s) => s.closeMini);
  const sessionId = useChatStore((s) => s.activeSessionId);
  const openPanel = useChatStore((s) => s.openPanel);
  const expandToPanel = () => {
    closeMini();
    openPanel();
  };

  // Safety net for the Radix modal-layer footgun: a modal dropdown sets
  // `document.body { pointer-events: none }` while open and only restores it on
  // close. If such a menu is ever torn down while still open, the lock is
  // stranded and the whole app — this window's header included — goes
  // unclickable. Clearing it on mount and unmount guarantees the popup can
  // always be recovered (e.g. via Escape), even if a future layer misbehaves.
  useEffect(() => {
    const clearStrandedPointerLock = () => {
      if (
        document.body.style.pointerEvents === "none" &&
        !document.querySelector("[data-radix-popper-content-wrapper]")
      ) {
        document.body.style.pointerEvents = "";
      }
    };
    clearStrandedPointerLock();
    return clearStrandedPointerLock;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        closeMini();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeMini]);

  return (
    <div
      ref={ref}
      data-state={state}
      data-ai-mini-window
      className={cn(
        "no-scrollbar-deep fixed z-40 flex flex-col overflow-hidden",
        "rounded-xl border border-border/60 bg-card text-xs shadow-[var(--shadow-float)]",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_24px_48px_-12px_rgba(0,0,0,0.45),0_8px_16px_-8px_rgba(0,0,0,0.3)]",
        "ring-1 ring-black/5 dark:ring-white/5",
        "duration-200 ease-out",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-bottom-2",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-foreground/[0.03] to-transparent"
      />
      {RESIZE_DIRS.map((dir) => (
        <ResizeHandle key={dir} dir={dir} onPointerDown={startResize(dir)} />
      ))}
      {sessionId ? (
        <Body
          sessionId={sessionId}
          onClose={closeMini}
          onExpand={expandToPanel}
          onHeaderPointerDown={onHeaderPointerDown}
        />
      ) : (
        <EmptyShell
          onClose={closeMini}
          onExpand={expandToPanel}
          onHeaderPointerDown={onHeaderPointerDown}
        />
      )}
      <PlanDiffReview />
    </div>
  );
}
