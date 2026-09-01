/**
 * Card header for one command block: status dot, cwd, git-branch chip,
 * "0.04s · exit 0" meta, Fix-with-AI on failures, and the full action
 * row as tooltipped icons — Re-run, Copy command, Copy output, Copy
 * command+output, Attach to AI, Find in block, Collapse, Dismiss — plus
 * the synthesized prompt-echo line that replaces the shell's own echo
 * rows (hidden by the renderer).
 */
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../../ui";
import { useGitBranch } from "../../../../gitBranch";
import { tabsRuntime } from "../../../../runtime";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  ComputerTerminal02Icon,
  Copy01Icon,
  CopyPlusIcon,
  GitBranchIcon,
  Refresh01Icon,
  Search01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSyncExternalStore } from "react";
import {
  focusLeafInput,
  submitToLeaf,
  type useTerminalSession,
} from "../../../lib/useTerminalSession";
import { findInBlock } from "../../lib/blockEvents";
import { capAttachOutput } from "../../lib/outputCap";
import { copy, fmtDuration, relPath } from "../../lib/overlayFormat";
import {
  getBlockUi,
  setBlockUi,
  subscribeLeafBlockUi,
} from "../../store/blockUiStore";
import { useBlockMeta } from "./useBlockMeta";

type Props = {
  leafId: number;
  blockId: string;
  session: ReturnType<typeof useTerminalSession>;
  promptReady: boolean;
};

function basename(p: string): string {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p;
}

export function BlockHeader({ leafId, blockId, session, promptReady }: Props) {
  const meta = useBlockMeta(session, blockId);
  const branch = useGitBranch(meta?.cwd ?? null);
  const ui = useSyncExternalStore(
    (cb) => subscribeLeafBlockUi(leafId, cb),
    () => getBlockUi(leafId, blockId),
  );

  if (!meta) return null;
  const failed = meta.exitCode !== null && meta.exitCode !== 0;
  const duration = fmtDuration(meta.finishedAt - meta.startedAt);
  const metaText = [duration, `exit ${meta.exitCode ?? 0}`]
    .filter(Boolean)
    .join(" · ");

  const output = () => session.readBlockId(blockId)?.output ?? "";

  const fixWithAi = () => {
    const out = capAttachOutput(output());
    const text = `Fix this failed command:\n$ ${meta.command}\n${out}\n(exit ${meta.exitCode})`;
    tabsRuntime()?.attachSelectionToAi(text, "terminal");
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: propagation guard, not an interaction target
    // biome-ignore lint/a11y/useKeyWithClickEvents: propagation guard, not an interaction target
    <div
      className="tb-header"
      // Header clicks must not fall through to the terminal's click-to-focus.
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <div className="tb-bar">
        <span className={failed ? "tb-dot tb-dot-fail" : "tb-dot"} />
        {meta.cwd && <span className="tb-cwd">{relPath(meta.cwd)}</span>}
        {branch && (
          <span className="tb-branch">
            <HugeiconsIcon icon={GitBranchIcon} size={10} strokeWidth={1.75} />
            {branch}
          </span>
        )}
        <span className="tb-meta">{metaText}</span>
        {failed && (
          <button type="button" className="tb-fix" onClick={fixWithAi}>
            <HugeiconsIcon icon={SparklesIcon} size={11} strokeWidth={1.75} />
            Fix with AI
          </button>
        )}
        <span className="tb-actions">
          <IconAction
            label="Run again"
            icon={Refresh01Icon}
            disabled={!promptReady || !meta.command}
            onClick={() => {
              submitToLeaf(leafId, meta.command);
              focusLeafInput(leafId);
            }}
          />
          <IconAction
            label="Copy command"
            icon={Copy01Icon}
            disabled={!meta.command}
            onClick={() => copy(meta.command, "Command copied")}
          />
          <IconAction
            label="Copy output"
            icon={ComputerTerminal02Icon}
            onClick={() => {
              const o = output();
              if (o) copy(o, "Output copied");
            }}
          />
          <IconAction
            label="Copy command and output"
            icon={CopyPlusIcon}
            onClick={() =>
              copy(`$ ${meta.command}\n${output()}`, "Block copied")
            }
          />
          <IconAction
            label="Attach to AI chat"
            icon={SparklesIcon}
            onClick={() => {
              const out = capAttachOutput(output());
              const text = out
                ? `$ ${meta.command}\n${out}`
                : `$ ${meta.command}`;
              tabsRuntime()?.attachSelectionToAi(text, "terminal");
            }}
          />
          <IconAction
            label="Find in block"
            icon={Search01Icon}
            onClick={() => findInBlock(leafId, blockId)}
          />
          <IconAction
            label={ui.collapsed ? "Expand" : "Collapse"}
            icon={ui.collapsed ? ArrowRight01Icon : ArrowDown01Icon}
            onClick={() =>
              setBlockUi(leafId, blockId, { collapsed: !ui.collapsed })
            }
          />
          <IconAction
            label="Dismiss"
            icon={Cancel01Icon}
            className="tb-btn-dismiss"
            onClick={() => setBlockUi(leafId, blockId, { dismissed: true })}
          />
        </span>
      </div>
      <div className="tb-echo">
        <span className="tb-echo-arrow">→</span>
        {meta.cwd && <span className="tb-echo-ws">{basename(meta.cwd)}</span>}
        {branch && (
          <span className="tb-echo-git">
            git:(<span className="tb-echo-branch">{branch}</span>)
          </span>
        )}
        <span className="tb-echo-cmd">{meta.command || " "}</span>
      </div>
    </div>
  );
}

function IconAction({
  label,
  icon,
  onClick,
  disabled,
  className,
}: {
  label: string;
  icon: typeof Copy01Icon;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Tooltip delayDuration={350}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={className ? `tb-btn ${className}` : "tb-btn"}
          disabled={disabled}
          onClick={onClick}
        >
          <HugeiconsIcon icon={icon} size={12.5} strokeWidth={1.75} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
