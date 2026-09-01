import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { PreferencesCapability } from "@termco/storage-base";
import type { UiStatusbarRootSlots, UiStatusbarRuntime } from "@termco/ui-statusbar-base";
import { CwdBreadcrumb } from "./components/CwdBreadcrumb";
import { LspStatusPill } from "./components/LspStatusPill";
import { WorkspaceEnvSelector } from "./components/WorkspaceEnvSelector";
import { AgentStatusItem } from "./items/AgentStatusItem";
import { AiOpenItem } from "./items/AiOpenItem";
import { PrivatePill } from "./items/PrivatePill";
import { ReadyDot } from "./items/ReadyDot";

export function ExactStatusBar({
  runtime,
  files,
  preferences,
  leftItems,
  rightItems,
}: {
  runtime: UiStatusbarRuntime;
  files: WorkspaceFilesCapability;
  preferences: PreferencesCapability;
} & UiStatusbarRootSlots) {
  const listSubdirs = async (
    path: string,
    workspace: UiStatusbarRuntime["workspace"],
  ) => {
    const showHidden = Boolean(await preferences.get<boolean>("showHidden"));
    return files.listSubdirs(path, showHidden, workspace);
  };
  return (
    <footer
      className="termco-chrome flex h-7 shrink-0 items-center justify-between gap-3 border-t border-border/70 px-3 font-mono text-xs text-muted-foreground"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <ReadyDot />
        <WorkspaceEnvSelector runtime={runtime} />
        <CwdBreadcrumb
          cwd={runtime.cwd}
          platform={runtime.platform}
          workspace={runtime.workspace}
          filePath={runtime.filePath}
          home={runtime.home}
          onCd={runtime.sendCd}
          listSubdirs={listSubdirs}
        />
        <LspStatusPill runtime={runtime} />
        <PrivatePill runtime={runtime} />
        {leftItems}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {rightItems}
        <AgentStatusItem runtime={runtime} />
        <AiOpenItem runtime={runtime} />
      </div>
    </footer>
  );
}
