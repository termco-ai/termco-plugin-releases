/**
 * Body-slot content for one command block. Consults the widget registry:
 * a replace-mode widget (ls chips, git rows) stands in for the block's
 * terminal rows; augment-mode widgets (URL pill) render below the real
 * output. Measures itself and reports the height to the blockUi store so
 * the renderer's layout table reserves the rig. Plain blocks render
 * nothing here — their real grid rows are the body.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { useTerminalSession } from "../../../lib/useTerminalSession";
import { COLLAPSED_BODY_PX } from "../../lib/blockChrome";
import {
  type BlockWidgetContext,
  matchAugmentWidgets,
  matchReplaceWidget,
} from "../../lib/widgetRegistry";
import {
  getBlockUi,
  setBlockUi,
  subscribeLeafBlockUi,
} from "../../store/blockUiStore";
import { useBlockMeta } from "./useBlockMeta";
import "./builtinWidgets";

type Props = {
  leafId: number;
  blockId: string;
  session: ReturnType<typeof useTerminalSession>;
};

export function BlockBody({ leafId, blockId, session }: Props) {
  const meta = useBlockMeta(session, blockId);
  const ui = useSyncExternalStore(
    (cb) => subscribeLeafBlockUi(leafId, cb),
    () => getBlockUi(leafId, blockId),
  );

  // Widget matching runs once per mount: a finished block is immutable.
  const { replace, augments } = useMemo(() => {
    if (!meta) {
      return {
        replace: null,
        augments: [] as ReturnType<typeof matchAugmentWidgets>,
      };
    }
    let outputCache: string | null = null;
    const ctx: BlockWidgetContext = {
      command: meta.command ?? "",
      cwd: meta.cwd,
      exitCode: meta.exitCode,
      env: session.leafEnv(),
      readOutput: () => {
        outputCache ??= session.readBlockId(blockId)?.output ?? "";
        return outputCache;
      },
    };
    return {
      replace: matchReplaceWidget(ctx),
      augments: matchAugmentWidgets(ctx),
      ctx,
    };
  }, [meta, session, blockId]);

  // Escape hatch: a widget whose data source is empty/broken falls back
  // to the block's plain rows.
  const [degraded, setDegraded] = useState(false);
  const onEmpty = useCallback(() => setDegraded(true), []);
  const activeReplace = degraded ? null : replace;

  useEffect(() => {
    setBlockUi(leafId, blockId, {
      bodyKind: activeReplace ? "widget" : "rows",
    });
  }, [leafId, blockId, activeReplace]);

  if (!meta) return null;

  if (ui.collapsed) {
    const hidden =
      meta.endLine - (meta.startLine + meta.hiddenLeadingLines) + 1;
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: expand is also on the header collapse button
      // biome-ignore lint/a11y/noStaticElementInteractions: expand is also on the header collapse button
      <div
        className="tb-collapsed"
        style={{ height: COLLAPSED_BODY_PX }}
        onClick={() => setBlockUi(leafId, blockId, { collapsed: false })}
      >
        … {Math.max(hidden, 0)} lines hidden
      </div>
    );
  }

  const ctx: BlockWidgetContext = {
    command: meta.command ?? "",
    cwd: meta.cwd,
    exitCode: meta.exitCode,
    env: session.leafEnv(),
    readOutput: () => session.readBlockId(blockId)?.output ?? "",
  };

  const parts: React.ReactNode[] = [];
  if (activeReplace) {
    const W = activeReplace.spec.component;
    parts.push(
      <W
        key={activeReplace.spec.id}
        ctx={ctx}
        data={activeReplace.data}
        onEmpty={onEmpty}
      />,
    );
  }
  for (const a of augments) {
    const W = a.spec.component;
    parts.push(
      <W key={a.spec.id} ctx={ctx} data={a.data} onEmpty={() => {}} />,
    );
  }

  return (
    <Measured
      onHeight={(h) => setBlockUi(leafId, blockId, { bodyPx: h })}
      empty={parts.length === 0}
    >
      {parts}
    </Measured>
  );
}

function Measured({
  children,
  empty,
  onHeight,
}: {
  children: React.ReactNode;
  empty: boolean;
  onHeight: (px: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onHeightRef = useRef(onHeight);
  onHeightRef.current = onHeight;

  useEffect(() => {
    if (empty) {
      onHeightRef.current(0);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const report = () => onHeightRef.current(Math.ceil(el.offsetHeight));
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [empty]);

  if (empty) return null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: propagation guard, not an interaction target
    <div ref={ref} className="tb-body" onMouseDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}
