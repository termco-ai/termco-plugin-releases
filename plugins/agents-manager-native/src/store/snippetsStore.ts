import type { AiLibrarySnippet } from "@termco/ai-library-base";
import { actions, hydrate, snapshot, subscribe, useLibrarySelector } from "../runtime";

type State = {
  hydrated: boolean;
  snippets: AiLibrarySnippet[];
  hydrate(): Promise<void>;
  upsert(snippet: AiLibrarySnippet): void;
  remove(id: string): void;
};
const state = (): State => ({
  hydrated: snapshot().hydrated,
  snippets: snapshot().snippets,
  hydrate,
  upsert: (snippet) => void actions.upsertSnippet(snippet),
  remove: (id) => void actions.removeSnippet(id),
});
function useStore<T>(selector: (value: State) => T): T {
  useLibrarySelector((value) => value.revision);
  return selector(state());
}
export const useSnippetsStore = Object.assign(useStore, { getState: state, subscribe });
export function newSnippetId(): string {
  return `sn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
