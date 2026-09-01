/**
 * Compact surface launcher for the tab strip. Each destination explains what
 * it creates, making this an object chooser rather than an unlabeled command
 * list.
 */
import { Button } from "../../ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui";
import { fmtShortcut, MOD_KEY, SHIFT_KEY } from "../../platform";
import {
  ComputerTerminal02Icon,
  GitBranchIcon,
  Globe02Icon,
  IncognitoIcon,
  PencilEdit02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type NewTabMenuProps = {
  onNew: () => void;
  onNewBlock: () => void;
  onNewPrivate: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onNewGitGraph: () => void;
};

export function NewTabMenu({
  onNew,
  onNewBlock,
  onNewPrivate,
  onNewPreview,
  onNewEditor,
  onNewGitGraph,
}: NewTabMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Open a new surface"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-80 overflow-hidden p-0"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="border-b border-border/70 px-3.5 py-3">
          <p className="text-xs font-semibold text-foreground">Open surface</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Add a tool to the current workspace.
          </p>
        </div>
        <div className="p-1.5">
          <LaunchItem
            label="Terminal"
            description="A standard shell session"
            icon={ComputerTerminal02Icon}
            shortcut={fmtShortcut(MOD_KEY, "T")}
            onSelect={onNew}
          />
          <LaunchItem
            label="Command blocks"
            description="A notebook-style terminal history"
            icon={ComputerTerminal02Icon}
            shortcut={fmtShortcut(MOD_KEY, SHIFT_KEY, "T")}
            onSelect={onNewBlock}
          />
          <LaunchItem
            label="Private terminal"
            description="No scrollback or persisted history"
            icon={IncognitoIcon}
            shortcut={fmtShortcut(MOD_KEY, "R")}
            onSelect={onNewPrivate}
          />
          <div className="my-1 border-t border-border/60" />
          <LaunchItem
            label="Editor"
            description="Edit a file with syntax support"
            icon={PencilEdit02Icon}
            shortcut={fmtShortcut(MOD_KEY, "E")}
            onSelect={onNewEditor}
          />
          <LaunchItem
            label="Web preview"
            description="Inspect a local development server"
            icon={Globe02Icon}
            shortcut={fmtShortcut(MOD_KEY, "P")}
            onSelect={onNewPreview}
          />
          <LaunchItem
            label="Git graph"
            description="Explore branches, commits, and history"
            icon={GitBranchIcon}
            onSelect={onNewGitGraph}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LaunchItem({
  label,
  description,
  icon,
  shortcut,
  onSelect,
}: {
  label: string;
  description: string;
  icon: typeof PlusSignIcon;
  shortcut?: string;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className="group items-center gap-3 rounded-lg px-2.5 py-2"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-background text-muted-foreground group-focus:text-foreground">
        <HugeiconsIcon icon={icon} size={15} strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-foreground">
          {label}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      {shortcut ? (
        <kbd className="shrink-0 rounded border border-border bg-muted/35 px-1.5 py-0.5 text-xs text-muted-foreground">
          {shortcut}
        </kbd>
      ) : null}
    </DropdownMenuItem>
  );
}
