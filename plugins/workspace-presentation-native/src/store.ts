import type {
  WorkspacePresentationCapability,
  WorkspacePresentationControlCapability,
  WorkspacePresentationSnapshot,
  WorkspacePresentationState,
} from "@termco/workspace-base";

const INITIAL_SNAPSHOT: WorkspacePresentationSnapshot = {
  revision: 0,
  header: {
    tabs: [],
    allTabs: [],
    activeTabId: 0,
    agentsViewOpen: false,
    editorDirty: false,
    findTarget: null,
  },
  sidebar: {
    rootPath: null,
    workspace: { kind: "local" },
    activeFilePath: null,
  },
  context: {
    cwd: null,
    filePath: null,
    home: null,
    privateActive: false,
    zenMode: false,
  },
};

export class WorkspacePresentationStore
  implements
    WorkspacePresentationCapability,
    WorkspacePresentationControlCapability
{
  readonly #listeners = new Set<() => void>();
  #snapshot = INITIAL_SNAPSHOT;

  snapshot = (): WorkspacePresentationSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  publish(state: WorkspacePresentationState): void {
    this.#snapshot = { revision: this.#snapshot.revision + 1, ...state };
    for (const listener of this.#listeners) listener();
  }
}
