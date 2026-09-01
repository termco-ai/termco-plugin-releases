/**
 * A single terminal pane. Owns the xterm session lifecycle for one leaf and
 * exposes an imperative handle (write / focus / read buffer / read selection)
 * to callers. Renders either the plain terminal surface or, when command
 * blocks are enabled, the block-mode layout (see `BlockPaneLayout`).
 */

import { useTheme } from "../../theme";
import type { TerminalSearchHandle } from "../lib/search/types";
import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { useTerminalSession } from "../lib/useTerminalSession";
import { BlockPaneLayout } from "./BlockPaneLayout";
import type { WorkspaceEnv } from "../../runtime";

export type TerminalPaneHandle = {
  write: (data: string) => void;
  focus: () => void;
  getBuffer: (maxLines?: number) => string | null;
  getSelection: () => string | null;
};

type Props = {
  /** Stable identifier for this leaf (passed back through callbacks). */
  leafId: number;
  /** Workspace owned by the tab's rig; captured by the PTY session. */
  workspace: WorkspaceEnv;
  /** Tab containing this pane is on screen. */
  visible: boolean;
  /** This leaf is the active pane within its tab — receives auto-focus. */
  focused?: boolean;
  initialCwd?: string;
  /** Enable command-block decorations (OSC 133) for this terminal. */
  blocks?: boolean;
  onSearchReady?: (leafId: number, addon: TerminalSearchHandle) => void;
  onExit?: (leafId: number, code: number) => void;
  onCwd?: (leafId: number, cwd: string) => void;
};

export const TerminalPane = memo(
  forwardRef<TerminalPaneHandle, Props>(function TerminalPane(
    {
      leafId,
      workspace,
      visible,
      focused = true,
      initialCwd,
      blocks = false,
      onSearchReady,
      onExit,
      onCwd,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const downYRef = useRef<number | null>(null);
    const { resolvedMode, themeId, customThemes } = useTheme();

    const session = useTerminalSession({
      leafId,
      workspace,
      container: containerRef,
      visible,
      focused,
      initialCwd,
      blocks,
      onSearchReady: (a) => onSearchReady?.(leafId, a),
      onExit: (c) => onExit?.(leafId, c),
      onCwd: (c) => onCwd?.(leafId, c),
    });

    useEffect(() => {
      // Defer one frame so CSS-variable token resolution sees the new class.
      const id = requestAnimationFrame(() => session.applyTheme());
      return () => cancelAnimationFrame(id);
    }, [resolvedMode, themeId, customThemes, session]);

    useImperativeHandle(
      ref,
      () => ({
        write: (data: string) => session.write(data),
        focus: () => session.focus(),
        getBuffer: (max?: number) => session.getBuffer(max),
        getSelection: () => session.getSelection(),
      }),
      [session],
    );

    const hideStyle = {
      visibility: visible ? ("visible" as const) : ("hidden" as const),
      pointerEvents: visible ? ("auto" as const) : ("none" as const),
    };

    const promptReady = session.blockMode === "prompt";

    if (blocks) {
      return (
        <BlockPaneLayout
          leafId={leafId}
          session={session}
          containerRef={containerRef}
          downYRef={downYRef}
          hideStyle={hideStyle}
          promptReady={promptReady}
        />
      );
    }

    return (
      <div
        data-terminal-padding
        className="zoom-exempt h-full w-full px-2"
        style={hideStyle}
      >
        <div ref={containerRef} className="h-full w-full" />
      </div>
    );
  }),
);
