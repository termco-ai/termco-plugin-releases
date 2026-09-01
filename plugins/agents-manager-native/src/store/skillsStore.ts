import type { AiLibrarySkill } from "@termco/ai-library-base";
import { actions, hydrate, snapshot, subscribe, useLibrarySelector } from "../runtime";

type State = {
  hydrated: boolean;
  library: AiLibrarySkill[];
  libraryDisabled: string[];
  enabledProject: Record<string, string[]>;
  hydrate(): Promise<void>;
  importSkill(skill: AiLibrarySkill): void;
  removeFromLibrary(id: string): void;
  toggleLibrary(id: string): void;
  setProjectEnabled(scope: string, key: string, enabled: boolean): void;
  isProjectEnabled(scope: string, key: string): boolean;
  enabledLibrary(): AiLibrarySkill[];
};
const state = (): State => ({
  hydrated: snapshot().hydrated,
  library: snapshot().skills,
  libraryDisabled: snapshot().disabledSkillIds,
  enabledProject: snapshot().enabledProjectSkills,
  hydrate,
  importSkill: (skill) => void actions.upsertSkill(skill),
  removeFromLibrary: (id) => void actions.removeSkill(id),
  toggleLibrary: (id) => void actions.toggleSkill(id),
  setProjectEnabled: (scope, key, enabled) => void actions.setProjectSkillEnabled(scope, key, enabled),
  isProjectEnabled: (scope, key) => (snapshot().enabledProjectSkills[scope] ?? []).includes(key),
  enabledLibrary: () => {
    const disabled = new Set(snapshot().disabledSkillIds);
    return snapshot().skills.filter((skill) => !disabled.has(skill.id));
  },
});
function useStore<T>(selector: (value: State) => T): T {
  useLibrarySelector((value) => value.revision);
  return selector(state());
}
export const useSkillsStore = Object.assign(useStore, { getState: state, subscribe });
export function newSkillId(): string {
  return `sk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
