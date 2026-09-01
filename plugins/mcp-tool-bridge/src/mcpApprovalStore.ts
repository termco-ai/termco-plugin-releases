import { create } from "zustand";

export type McpApprovalSource =
  | { kind: "run"; runId: string }
  | { kind: "user"; label: string };

export type McpApprovalRequest = {
  requestId: string;
  source: McpApprovalSource;
  rig: { rigId: string; rigName: string };
  toolName: string;
  input: Record<string, unknown>;
  catastrophic: boolean;
};

type State = {
  pending: McpApprovalRequest[];
  add(request: McpApprovalRequest): void;
  answer(requestId: string, allow: boolean, always?: boolean): void;
};

export function createMcpApprovalStore(
  reply: (requestId: string, value: unknown) => Promise<unknown>,
) {
  const useStore = create<State>((set, get) => ({
    pending: [],
    add: (request) =>
      set((state) =>
        state.pending.some((entry) => entry.requestId === request.requestId)
          ? state
          : { pending: [...state.pending, request] },
      ),
    answer: (requestId, allow, always) => {
      if (!get().pending.some((entry) => entry.requestId === requestId)) return;
      set((state) => ({
        pending: state.pending.filter((entry) => entry.requestId !== requestId),
      }));
      void reply(requestId, { allow, always }).catch(() => {});
    },
  }));
  return {
    useStore,
    add(request: unknown) {
      useStore.getState().add(request as McpApprovalRequest);
    },
  };
}

export type McpApprovalStore = ReturnType<typeof createMcpApprovalStore>;
