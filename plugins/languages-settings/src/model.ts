import type { LspServerConfig } from "@termco/editor-base";

export interface ServerDraft {
  id: string;
  name: string;
  languages: string;
  command: string;
  args: string;
  rootMarkers: string;
  projectMarkers: string;
  secondary: boolean;
  initializationOptions: string;
  settings: string;
}

const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
const json = (label: string, value: string): unknown => {
  if (!value.trim()) return undefined;
  try { return JSON.parse(value); } catch { throw new Error(`${label} is not valid JSON`); }
};

export function draftFromServer(server?: LspServerConfig | null): ServerDraft {
  return {
    id: server?.id ?? "",
    name: server?.name ?? "",
    languages: server?.languages.join(", ") ?? "",
    command: server?.command ?? "",
    args: server?.args.join(" ") ?? "",
    rootMarkers: server?.rootMarkers.join(", ") ?? "",
    projectMarkers: server?.projectMarkers?.join(", ") ?? "",
    secondary: server?.role === "secondary",
    initializationOptions: server?.initializationOptions == null ? "" : JSON.stringify(server.initializationOptions, null, 2),
    settings: server?.settings == null ? "" : JSON.stringify(server.settings, null, 2),
  };
}

export function serverFromDraft(draft: ServerDraft, enabled = true): LspServerConfig {
  const id = draft.id.trim();
  const command = draft.command.trim();
  const languages = list(draft.languages).map((language) => language.toLowerCase());
  if (!id) throw new Error("id is required");
  if (!command) throw new Error("command is required");
  if (languages.length === 0) throw new Error("at least one language is required");
  const projectMarkers = list(draft.projectMarkers);
  return {
    id,
    name: draft.name.trim() || id,
    languages,
    command,
    args: draft.args.trim() ? draft.args.trim().split(/\s+/) : [],
    rootMarkers: list(draft.rootMarkers),
    ...(projectMarkers.length ? { projectMarkers } : {}),
    ...(draft.secondary ? { role: "secondary" as const } : {}),
    initializationOptions: json("Initialization options", draft.initializationOptions),
    settings: json("Settings", draft.settings),
    enabled,
    custom: true,
  };
}
