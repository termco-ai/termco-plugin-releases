/**
 * Effective server config = curated catalog + user overrides + custom servers.
 * The user part persists to `<userData>/termco-lsp.json`; main is the single
 * owner (the settings UI reads/writes through lsp_config_* commands only).
 */
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { CURATED_SERVERS } from "./registry";
import type { LspServerConfig, LspUserConfig } from "./types";

type ConfigListener = (changedIds: string[]) => void;

let userConfig: LspUserConfig | null = null;
let configuredConfigPath: string | null = null;
const listeners = new Set<ConfigListener>();

export function lspConfigPathActive(): boolean {
  return configuredConfigPath !== null;
}

function configPath(): string {
  if (!configuredConfigPath) {
    throw new Error("lsp-native config path is not configured");
  }
  return configuredConfigPath;
}

/** Main-process lifecycle seam plus deterministic test override. */
export function configureLspConfigPath(path: string | null): void {
  configuredConfigPath = path;
  userConfig = null;
}

function loadUserConfig(): LspUserConfig {
  if (userConfig) return userConfig;
  try {
    userConfig = JSON.parse(
      readFileSync(configPath(), "utf8"),
    ) as LspUserConfig;
  } catch {
    userConfig = {};
  }
  return userConfig;
}

function persist(): void {
  const path = configPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(userConfig ?? {}, null, 2)}\n`);
  renameSync(tmp, path);
}

/** The merged, effective server list (curated + overrides + custom). */
export function effectiveServers(): LspServerConfig[] {
  const user = loadUserConfig();
  const curated = CURATED_SERVERS.map((base) => {
    const override = user.overrides?.[base.id];
    return override ? { ...base, ...override } : base;
  });
  const custom = (user.custom ?? []).map((c) => ({ ...c, custom: true }));
  return [...curated, ...custom];
}

export function serverById(id: string): LspServerConfig | undefined {
  return effectiveServers().find((s) => s.id === id);
}

/** All enabled servers claiming this CodeMirror language id, in curated order
 * (curated before custom). The session manager picks by specificity/role. */
export function serversForLanguage(cmLanguageId: string): LspServerConfig[] {
  return effectiveServers().filter(
    (s) => s.enabled && s.languages.includes(cmLanguageId),
  );
}

export function onConfigChange(listener: ConfigListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange(ids: string[]): void {
  for (const l of listeners) l(ids);
}

export function setServerEnabled(id: string, enabled: boolean): void {
  const user = loadUserConfig();
  const custom = user.custom?.find((c) => c.id === id);
  if (custom) {
    custom.enabled = enabled;
  } else {
    user.overrides = user.overrides ?? {};
    user.overrides[id] = { ...user.overrides[id], enabled };
  }
  persist();
  emitChange([id]);
}

/** Add or replace a user-defined server (id collision with curated is rejected). */
export function upsertCustomServer(server: LspServerConfig): void {
  if (CURATED_SERVERS.some((s) => s.id === server.id)) {
    throw new Error(`server id "${server.id}" is reserved by a built-in server`);
  }
  const user = loadUserConfig();
  user.custom = user.custom ?? [];
  const at = user.custom.findIndex((c) => c.id === server.id);
  const entry = { ...server, custom: true };
  if (at >= 0) user.custom[at] = entry;
  else user.custom.push(entry);
  persist();
  emitChange([server.id]);
}

export function removeCustomServer(id: string): void {
  const user = loadUserConfig();
  const before = user.custom?.length ?? 0;
  user.custom = (user.custom ?? []).filter((c) => c.id !== id);
  if ((user.custom.length ?? 0) !== before) {
    persist();
    emitChange([id]);
  }
}

/** Override curated-server knobs (initializationOptions/settings/command/args). */
export function updateServerOverride(
  id: string,
  patch: Partial<
    Pick<
      LspServerConfig,
      "initializationOptions" | "settings" | "command" | "args"
    >
  >,
): void {
  const user = loadUserConfig();
  const custom = user.custom?.find((c) => c.id === id);
  if (custom) {
    Object.assign(custom, patch);
  } else {
    user.overrides = user.overrides ?? {};
    user.overrides[id] = { ...user.overrides[id], ...patch };
  }
  persist();
  emitChange([id]);
}
