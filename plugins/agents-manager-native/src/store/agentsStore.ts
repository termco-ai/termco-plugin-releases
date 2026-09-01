import type { AiLibraryAgent } from "@termco/ai-library-base";
import { actions, hydrate, snapshot, subscribe, useLibrarySelector } from "../runtime";

type State = {
  hydrated: boolean;
  customAgents: AiLibraryAgent[];
  activeId: string;
  all(): AiLibraryAgent[];
  hydrate(): Promise<void>;
  setActiveId(id: string): void;
  upsert(agent: AiLibraryAgent): void;
  remove(id: string): void;
};

const state = (): State => ({
  hydrated: snapshot().hydrated,
  customAgents: snapshot().customAgents,
  activeId: snapshot().activeAgentId,
  all: () => snapshot().agents,
  hydrate,
  setActiveId: (id) => void actions.setActiveAgent(id),
  upsert: (agent) => void actions.upsertAgent(agent),
  remove: (id) => void actions.removeAgent(id),
});

function useStore<T>(selector: (value: State) => T): T {
  useLibrarySelector((value) => value.revision);
  return selector(state());
}

export const useAgentsStore = Object.assign(useStore, {
  getState: state,
  subscribe,
});

export function newAgentId(): string {
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
