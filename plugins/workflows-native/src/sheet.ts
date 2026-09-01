import type { WorkflowDefinition, WorkflowValues } from "@termco/workflows-base";

export interface WorkflowSheetSnapshot {
  open: boolean;
  workflow: WorkflowDefinition | null;
  prebind: WorkflowValues;
}

export interface WorkflowSheetController {
  snapshot(): WorkflowSheetSnapshot;
  subscribe(listener: () => void): () => void;
  open(workflow: WorkflowDefinition, prebind?: WorkflowValues): void;
  close(): void;
}

export function createWorkflowSheetController(): WorkflowSheetController {
  const listeners = new Set<() => void>();
  let snapshot: WorkflowSheetSnapshot = {
    open: false,
    workflow: null,
    prebind: {},
  };
  const publish = () => {
    for (const listener of listeners) listener();
  };
  return {
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open(workflow, prebind = {}) {
      snapshot = { open: true, workflow, prebind };
      publish();
    },
    close() {
      snapshot = { open: false, workflow: null, prebind: {} };
      publish();
    },
  };
}
