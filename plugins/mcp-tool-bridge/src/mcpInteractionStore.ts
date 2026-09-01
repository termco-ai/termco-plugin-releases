import { create } from "zustand";

export type McpInteraction = {
  requestId: string;
  runId: string;
  kind: "ask_user" | "show_ui";
  input: Record<string, unknown>;
};

type State = {
  pending: McpInteraction[];
  add(interaction: McpInteraction): void;
  answer(requestId: string, value: Record<string, unknown>): void;
  dismiss(requestId: string): void;
};

export function createMcpInteractionStore(
  reply: (requestId: string, value: unknown) => Promise<unknown>,
) {
  const useStore = create<State>((set, get) => ({
    pending: [],
    add: (interaction) =>
      set((state) =>
        state.pending.some((entry) => entry.requestId === interaction.requestId)
          ? state
          : { pending: [...state.pending, interaction] },
      ),
    answer: (requestId, value) => {
      if (!get().pending.some((entry) => entry.requestId === requestId)) return;
      set((state) => ({
        pending: state.pending.filter((entry) => entry.requestId !== requestId),
      }));
      void reply(requestId, value).catch(() => {});
    },
    dismiss: (requestId) =>
      set((state) => ({
        pending: state.pending.filter((entry) => entry.requestId !== requestId),
      })),
  }));
  return {
    useStore,
    add(interaction: unknown) {
      useStore.getState().add(interaction as McpInteraction);
    },
  };
}

export type McpInteractionStore = ReturnType<typeof createMcpInteractionStore>;
