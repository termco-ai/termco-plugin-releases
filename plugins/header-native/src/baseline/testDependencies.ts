import type { AgentHooksCapability } from "@termco/agents-base";
import type { EditorLanguagesCapability } from "@termco/editor-base";
import type { WorkspaceFileIconsCapability } from "@termco/files-base";
import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import type { SshClientCapability } from "@termco/ssh-base";
import { installHeaderDependencies } from "./runtime";

const languages = [
  { name: "TypeScript", ext: "ts" },
  { name: "Rust", ext: "rs" },
];
const shortcutSnapshot = {
  revision: 0,
  groups: [] as string[],
  shortcuts: [],
  overrides: {},
};

installHeaderDependencies({
  agentHooks: {
    enable() {},
    status() { return false; },
  } satisfies AgentHooksCapability,
  fileIcons: {
    fileIconUrl: (name) => `icon:${name}`,
    folderIconUrl: (name, expanded) => `folder:${expanded ? "open" : "closed"}:${name}`,
  } satisfies WorkspaceFileIconsCapability,
  languages: {
    all: () => languages,
    common: () => languages,
    displayName: () => "TypeScript",
  } satisfies EditorLanguagesCapability,
  shortcuts: {
    snapshot: () => shortcutSnapshot,
    subscribe: () => () => {},
    bindings: (id) => [{ ctrl: true, key: id === "rig.overview" ? "k" : "f" }],
    match: () => false,
    format: (binding) => binding ? [binding.ctrl ? "Ctrl" : "", binding.key.toUpperCase()].filter(Boolean) : [],
    useHandlers: () => {},
    setBindings: async () => {},
    reset: async () => {},
    resetAll: async () => {},
  } satisfies ShortcutRegistryCapability,
  ssh: { listHosts: () => [] } as unknown as SshClientCapability,
});
