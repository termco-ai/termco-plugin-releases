import type { EditorNavigationCapability } from "@termco/editor-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import {
  TERMINAL_BLOCK_EVENTS,
  type TerminalBlockOpenFile,
} from "@termco/terminal-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { toast } from "sonner";

/** Routes terminal block file chips through the selected editor and files
 * providers. The editor plugin owns this consumer because it owns file-tab
 * navigation; the terminal only emits the provider-neutral action. */
export function installTerminalFileNavigation(
  events: ApplicationEventsCapability,
  files: WorkspaceFilesCapability,
  navigation: EditorNavigationCapability,
  currentWorkspace: () => WorkspaceEnv,
): () => void {
  return events.subscribe(TERMINAL_BLOCK_EVENTS.openFile, (payload) => {
    const { path, line } = payload as TerminalBlockOpenFile;
    if (!path) return;
    const open = () => {
      if (typeof line === "number" && line > 0) {
        navigation.openFileAt(path, line, true);
      } else {
        navigation.openFile(path, true);
      }
    };
    void files
      .stat(path, currentWorkspace(), true)
      .then((stat) => {
        if (!stat) {
          toast.error("File not found", { description: path });
          return;
        }
        open();
      })
      .catch(open);
  });
}
