import type {
  UiWorkspaceComposerCapability,
  UiWorkspaceComposerSnapshot,
  UiWorkspaceFooterContribution,
} from "@termco/ui-workspace-base";
import type { WorkspaceTabsCapability } from "@termco/workspace-base";
import { type ReactNode, useSyncExternalStore } from "react";
import { AiInputBarConnect } from "../baseline/components/AiInputBar";
import { AiComposerInput } from "../baseline/components/AiComposerInput/AiComposerInput";
import { ChipsRow } from "../baseline/components/ChipsRow";
import { ComposerActions } from "../baseline/components/ComposerActions/ComposerActions";
import { useComposer } from "../baseline/lib/composer";
import { useChatStore } from "../store/store";
import { openSettingsWindow } from "../baseline/runtime/settings";

let revision = 0;
let currentFocus: (() => void) | null = null;

function readState(): Omit<UiWorkspaceComposerSnapshot, "revision"> {
  const state = useChatStore.getState();
  const available = [
    ...Object.values(state.apiKeys),
    ...Object.values(state.customEndpointKeys),
  ].some(Boolean);
  return {
    available,
    hostedElsewhere: available && (state.panelOpen || state.mini.open),
  };
}

let snapshot: UiWorkspaceComposerSnapshot = { revision, ...readState() };
useChatStore.subscribe(() => {
  const next = readState();
  if (
    next.available === snapshot.available &&
    next.hostedElsewhere === snapshot.hostedElsewhere
  ) {
    return;
  }
  snapshot = { revision: ++revision, ...next };
});

function removeSnippetToken(
  value: string,
  handle: string,
): string {
  const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(`(^|\\s)#${escaped}\\b ?`), (_match, lead) =>
    String(lead),
  );
}

export function WorkspaceComposerRegion({
  region,
  visible,
  leading,
}: {
  region: "chips" | "input" | "actions";
  visible: boolean;
  leading?: ReactNode;
}) {
  const composer = useComposer();
  currentFocus = () => composer.textareaRef.current?.focus();

  if (region === "chips") {
    return (
      <ChipsRow
        leading={leading}
        files={composer.files}
        onRemoveFile={composer.removeFile}
        snippets={composer.pickedSnippets}
        onRemoveSnippet={(id) => {
          const snippet = composer.pickedSnippets.find((item) => item.id === id);
          composer.removeSnippet(id);
          if (snippet) {
            composer.setValue((value) =>
              removeSnippetToken(value, snippet.handle),
            );
          }
        }}
        commands={composer.pickedCommands}
        onRemoveCommand={composer.removeCommand}
      />
    );
  }
  if (!visible) return null;
  return region === "input" ? <AiComposerInput /> : <ComposerActions showAgent />;
}

export const workspaceComposerCapability: UiWorkspaceComposerCapability = {
  snapshot: () => snapshot,
  subscribe(listener) {
    return useChatStore.subscribe(listener);
  },
  focus() {
    requestAnimationFrame(() => currentFocus?.());
  },
  Region: WorkspaceComposerRegion,
};

function createConnectFooter(tabs: WorkspaceTabsCapability) {
  return function AiConnectFooter() {
    const tabSnapshot = useSyncExternalStore(
      (listener) => tabs.subscribe(listener),
      () => tabs.snapshot(),
      () => tabs.snapshot(),
    );
    const keysLoaded = useChatStore((state) => state.keysLoaded);
    const panelOpen = useChatStore((state) => state.panelOpen);
    const available = useChatStore((state) =>
      [...Object.values(state.apiKeys), ...Object.values(state.customEndpointKeys)].some(
        Boolean,
      ),
    );
    const active = tabSnapshot.tabs.find((tab) => tab.id === tabSnapshot.activeId);
    const isBlock = active?.kind === "terminal" && active.data?.blocks === true;
    if (isBlock || !keysLoaded || !panelOpen || available) return null;
    return (
      <div data-ai-input-bar data-state="open" className="termco-reveal">
        <AiInputBarConnect onAdd={() => void openSettingsWindow("models")} />
      </div>
    );
  };
}

export function createAiConnectFooterContribution(
  tabs: WorkspaceTabsCapability,
): UiWorkspaceFooterContribution {
  return {
    id: "ai-connect",
    order: 10,
    Component: createConnectFooter(tabs),
  };
}
