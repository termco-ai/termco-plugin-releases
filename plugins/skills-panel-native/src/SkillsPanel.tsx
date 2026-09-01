/**
 * Sidebar "Adopt" panel. Two scopes (segmented control): **This folder** — the
 * agent-config discovered in the current workspace (enable-for-project, and
 * adopt/copy into Termco); and **Installed** — everything globally adopted
 * (skills library, MCP servers, personas, snippets), each activatable /
 * removable right here while chatting. Within each scope, per-kind tabs (labeled
 * pills, ordered by kind) show one kind at a time. Row names open the underlying
 * file in the editor when there is one.
 */
import type {
  AiLibraryArtifactKind as ArtifactKind,
  AiLibraryDiscoveredArtifact as DiscoveredArtifact,
  AiLibraryMcpServer as McpServerConfig,
} from "@termco/ai-library-base";
import ui from "@termco/ui";
import { native } from "./fileRuntime";
import {
  fmAllowedGroups,
  fmDescription,
  fmName,
  fmWhenToUse,
  normalizeHandle,
  parseMcpConfig,
  parseFrontmatter,
  skillScopeRootKey,
} from "./helpers";
import type { SkillsDetector } from "./detector";
import {
  newAgentId,
  newSkillId,
  newSnippetId,
  useAgentsStore,
  useMcpStore,
  useSkillsStore,
  useSnippetsStore,
} from "./libraryStore";
import {
  Delete02Icon,
  Download04Icon,
  RefreshIcon,
  SparklesIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useEffect, useState } from "react";

const { cn } = ui;

function Toggle({
  on,
  title,
  onClick,
}: {
  on: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={cn(
        "relative h-[15px] w-[26px] shrink-0 rounded-full transition-colors",
        on ? "bg-primary" : "bg-border",
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] size-[11px] rounded-full bg-background transition-all",
          on ? "left-[13px]" : "left-[2px]",
        )}
      />
    </button>
  );
}

/** Import / adopt button — a download that turns into a tick once done. */
function AdoptButton({
  done,
  title,
  onClick,
}: {
  done: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={done}
      title={title}
      onClick={onClick}
      className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
    >
      <HugeiconsIcon
        icon={done ? Tick02Icon : Download04Icon}
        size={12}
        strokeWidth={2}
      />
    </button>
  );
}

/** Small destructive icon button (remove / delete a row). */
function DeleteButton({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
    >
      <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={2} />
    </button>
  );
}

/** Artifact name — opens the underlying file when a path + handler exist. */
function NameCell({
  name,
  description,
  path,
  onOpen,
}: {
  name: string;
  description?: string;
  path?: string;
  onOpen?: (path: string) => void;
}) {
  const label = (
    <>
      {name}
      {description ? (
        <span className="text-muted-foreground"> — {description}</span>
      ) : null}
    </>
  );
  if (!path || !onOpen) {
    return (
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      title={`Open ${path}`}
      onClick={() => onOpen(path)}
      className="min-w-0 flex-1 truncate text-left text-xs text-foreground hover:underline"
    >
      {label}
    </button>
  );
}

type ParsedMcpFile = {
  artifact: DiscoveredArtifact;
  servers: McpServerConfig[];
  unsupported: { name: string; reason: string }[];
};

/**
 * MCP servers recognized in the folder. Each `.mcp.json` can declare several
 * servers; the user enables the ones they trust and we connect them in main.
 * Enabling is the disclosure gate — only connected servers' tools reach the
 * agent. Servers already enabled for this workspace auto-reconnect on load.
 */
function McpSection({
  artifacts,
  scopeRootKey,
  onOpenFile,
}: {
  artifacts: DiscoveredArtifact[];
  scopeRootKey: string;
  onOpenFile?: (path: string) => void;
}) {
  const [files, setFiles] = useState<ParsedMcpFile[]>([]);
  const status = useMcpStore((s) => s.status);
  const enabledServers = useMcpStore((s) => s.enabledServers);
  const setServerEnabled = useMcpStore((s) => s.setServerEnabled);
  const connectServer = useMcpStore((s) => s.connectServer);
  const userServers = useMcpStore((s) => s.userServers);
  const addUserServers = useMcpStore((s) => s.addUserServers);
  const hydrateMcp = useMcpStore((s) => s.hydrate);
  const adoptedNames = new Set(userServers.map((s) => s.name));

  const paths = artifacts.map((a) => a.path).join("|");
  useEffect(() => {
    void hydrateMcp();
    let alive = true;
    (async () => {
      const parsed: ParsedMcpFile[] = [];
      for (const a of artifacts) {
        const r = await native.readFile(a.path, { optional: true });
        if (r.kind !== "text") continue;
        const { servers, unsupported } = parseMcpConfig(r.content);
        parsed.push({ artifact: a, servers, unsupported });
      }
      if (alive) setFiles(parsed);
    })();
    return () => {
      alive = false;
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: `paths` keys the artifacts.
  }, [paths, hydrateMcp]);

  const enabledForScope = new Set(enabledServers[scopeRootKey] ?? []);

  // Reconnect servers the user enabled earlier but that aren't live yet
  // (e.g. after an app restart — main starts with no servers running).
  useEffect(() => {
    for (const f of files) {
      for (const cfg of f.servers) {
        if (!enabledForScope.has(cfg.name)) continue;
        const st = status[cfg.name];
        if (!st || (!st.connected && !st.connecting && !st.error)) {
          void connectServer(cfg);
        }
      }
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: run on file/enable changes.
  }, [files, scopeRootKey]);

  const total = files.reduce((n, f) => n + f.servers.length, 0);
  if (files.length === 0 || total === 0) return null;

  return (
    <section>
      <div className="mb-1 px-1.5 font-mono text-xs uppercase tracking-wide text-muted-foreground">
        MCP servers · {total}
      </div>
      <ul className="flex flex-col gap-0.5">
        {files.flatMap((f) =>
          f.servers.map((cfg) => {
            const on = enabledForScope.has(cfg.name);
            const st = status[cfg.name];
            const detail = !on
              ? undefined
              : st?.connecting
                ? "connecting…"
                : st?.error
                  ? st.error
                  : st?.connected
                    ? `${st.tools.length} tool${st.tools.length === 1 ? "" : "s"}`
                    : "starting…";
            return (
              <li
                key={`${f.artifact.path}::${cfg.name}`}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent/50"
              >
                <Toggle
                  on={on}
                  title={on ? "Disconnect server" : "Connect server"}
                  onClick={() => void setServerEnabled(scopeRootKey, cfg, !on)}
                />
                <button
                  type="button"
                  title={`Open ${f.artifact.path}`}
                  onClick={() => onOpenFile?.(f.artifact.path)}
                  disabled={!onOpenFile}
                  className="min-w-0 flex-1 truncate text-left text-xs text-foreground hover:underline disabled:hover:no-underline"
                >
                  {cfg.name}
                  {detail ? (
                    <span
                      className={cn(
                        "text-muted-foreground",
                        st?.error && on && "text-destructive",
                        st?.connected && on && "text-primary",
                      )}
                    >
                      {" "}
                      — {detail}
                    </span>
                  ) : null}
                </button>
                <span className="min-w-0 max-w-[38%] shrink truncate font-mono text-xs text-muted-foreground/80">
                  {f.artifact.tool}
                </span>
                <AdoptButton
                  done={adoptedNames.has(cfg.name)}
                  title={
                    adoptedNames.has(cfg.name)
                      ? "In your servers"
                      : "Copy to your servers (available everywhere)"
                  }
                  onClick={() => void addUserServers([cfg])}
                />
              </li>
            );
          }),
        )}
      </ul>
    </section>
  );
}

const KIND_ORDER: ArtifactKind[] = [
  "skill",
  "agent",
  "command",
  "memory",
  "rules",
  "settings",
];
const TARGET_NOTE: Record<DiscoveredArtifact["target"], string> = {
  skill: "→ Skills",
  persona: "→ Persona",
  slash: "→ Slash",
  "project-context": "context",
  mcp: "MCP",
  info: "detected",
};

/** Top-level scope: everything installed in Termco vs. the current folder. */
type Scope = "installed" | "folder";
/** Kind pills within a scope. */
const TAB_ORDER: ArtifactKind[] = [
  "skill",
  "mcp",
  "agent",
  "command",
  "memory",
  "rules",
  "settings",
];
/** The kinds that live globally in Termco (the "Installed" scope). */
const INSTALLED_ORDER: ArtifactKind[] = ["skill", "mcp", "agent", "command"];
const TAB_LABEL: Record<ArtifactKind, string> = {
  skill: "Skills",
  mcp: "MCP",
  agent: "Subagents",
  command: "Commands",
  memory: "Memory",
  rules: "Rules",
  settings: "Settings",
};

export function SkillsPanel({
  detector,
  onOpenFile,
}: {
  detector: SkillsDetector;
  onOpenFile?: (path: string) => void;
}) {
  const { result, loading, refresh } = detector;
  const artifacts = result?.artifacts ?? [];

  const hydrate = useSkillsStore((s) => s.hydrate);
  const enabledProject = useSkillsStore((s) => s.enabledProject);
  const setProjectEnabled = useSkillsStore((s) => s.setProjectEnabled);
  const importSkill = useSkillsStore((s) => s.importSkill);
  const library = useSkillsStore((s) => s.library);
  const libraryDisabled = useSkillsStore((s) => s.libraryDisabled);
  const toggleLibrary = useSkillsStore((s) => s.toggleLibrary);
  const removeFromLibrary = useSkillsStore((s) => s.removeFromLibrary);

  const customAgents = useAgentsStore((s) => s.customAgents);
  const upsertAgent = useAgentsStore((s) => s.upsert);
  const hydrateAgents = useAgentsStore((s) => s.hydrate);
  const activeAgentId = useAgentsStore((s) => s.activeId);
  const setActiveAgentId = useAgentsStore((s) => s.setActiveId);
  const removeAgent = useAgentsStore((s) => s.remove);
  const snippets = useSnippetsStore((s) => s.snippets);
  const upsertSnippet = useSnippetsStore((s) => s.upsert);
  const hydrateSnippets = useSnippetsStore((s) => s.hydrate);
  const removeSnippet = useSnippetsStore((s) => s.remove);

  const userServers = useMcpStore((s) => s.userServers);
  const mcpStatus = useMcpStore((s) => s.status);
  const isUserDisabled = useMcpStore((s) => s.isUserDisabled);
  const toggleUserServer = useMcpStore((s) => s.toggleUserServer);
  const removeUserServer = useMcpStore((s) => s.removeUserServer);
  const hydrateMcp = useMcpStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
    void hydrateAgents();
    void hydrateSnippets();
    void hydrateMcp();
  }, [hydrate, hydrateAgents, hydrateSnippets, hydrateMcp]);

  const scopeRootKey = result
    ? skillScopeRootKey(result.root, result.scopeKey)
    : "";
  const enabledSet = new Set(enabledProject[scopeRootKey] ?? []);
  const importedPaths = new Set(
    library.map((s) => s.source.path).filter(Boolean),
  );
  const personaNames = new Set(customAgents.map((a) => a.name.toLowerCase()));
  const snippetHandles = new Set(snippets.map((s) => s.handle));

  const importToLibrary = async (a: DiscoveredArtifact) => {
    const r = await native.readFile(a.path, { optional: true });
    if (r.kind !== "text") return;
    const fm = parseFrontmatter(r.content);
    importSkill({
      id: newSkillId(),
      name: fmName(fm, a.name),
      description: fmDescription(fm) ?? a.description ?? "",
      whenToUse: fmWhenToUse(fm),
      body: fm.body,
      allowedGroups: fmAllowedGroups(fm),
      model: fm.data.model || undefined,
      source: { origin: "project", tool: a.tool, path: a.path },
    });
  };

  const adoptAsPersona = async (a: DiscoveredArtifact) => {
    const r = await native.readFile(a.path, { optional: true });
    if (r.kind !== "text") return;
    const fm = parseFrontmatter(r.content);
    upsertAgent({
      id: newAgentId(),
      name: fmName(fm, a.name),
      description: fmDescription(fm) ?? "",
      instructions: fm.body,
      icon: "spark",
      builtIn: false,
      model: fm.data.model || undefined,
      preferredToolGroups: fmAllowedGroups(fm),
    });
  };

  const adoptAsSnippet = async (a: DiscoveredArtifact) => {
    const r = await native.readFile(a.path, { optional: true });
    if (r.kind !== "text") return;
    const fm = parseFrontmatter(r.content);
    upsertSnippet({
      id: newSnippetId(),
      handle: normalizeHandle(a.name),
      name: fmName(fm, a.name),
      description: fmDescription(fm) ?? "",
      content: fm.body,
    });
  };

  const groups = KIND_ORDER.map((kind) => ({
    kind,
    items: artifacts.filter((a) => a.kind === kind),
  })).filter((g) => g.items.length > 0);
  const mcpArtifacts = artifacts.filter((a) => a.kind === "mcp");

  // Installed = everything globally adopted in Termco; folder = current scan.
  const installedCount: Record<ArtifactKind, number> = {
    skill: library.length,
    mcp: userServers.length,
    agent: customAgents.length,
    command: snippets.length,
    memory: 0,
    rules: 0,
    settings: 0,
  };
  const installedTabs = INSTALLED_ORDER.filter(
    (k) => installedCount[k] > 0,
  ).map((k) => ({ id: k, label: TAB_LABEL[k], count: installedCount[k] }));
  const folderTabs = TAB_ORDER.map((kind) => ({
    id: kind,
    label: TAB_LABEL[kind],
    count:
      kind === "mcp"
        ? mcpArtifacts.length
        : (groups.find((g) => g.kind === kind)?.items.length ?? 0),
  })).filter((t) => t.count > 0);
  const installedTotal =
    library.length + userServers.length + customAgents.length + snippets.length;

  const [scope, setScope] = useState<Scope>("folder");
  const [activeTab, setActiveTab] = useState<ArtifactKind | null>(null);
  // Start each folder on its first tab; clicks persist within the folder.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset per folder.
  useEffect(() => setActiveTab(null), [scopeRootKey]);

  const tabs = scope === "installed" ? installedTabs : folderTabs;
  const tabIds = tabs.map((t) => t.id);
  const active =
    activeTab && tabIds.includes(activeTab) ? activeTab : tabIds[0];
  const activeItems =
    active && active !== "mcp"
      ? (groups.find((g) => g.kind === active)?.items ?? [])
      : [];

  const libraryList = (
    <ul className="flex flex-col gap-0.5">
      {library.map((s) => {
        const on = !libraryDisabled.includes(s.id);
        return (
          <li
            key={s.id}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent/50"
          >
            <Toggle
              on={on}
              title={on ? "Disable everywhere" : "Enable everywhere"}
              onClick={() => toggleLibrary(s.id)}
            />
            <NameCell
              name={s.name}
              description={s.description}
              path={s.source.path}
              onOpen={onOpenFile}
            />
            <DeleteButton
              title="Remove from library"
              onClick={() => removeFromLibrary(s.id)}
            />
          </li>
        );
      })}
    </ul>
  );

  const userServerList = (
    <ul className="flex flex-col gap-0.5">
      {userServers.map((cfg) => {
        const off = isUserDisabled(cfg.name);
        const st = mcpStatus[cfg.name];
        const detail = off
          ? "off"
          : st?.authState === "waiting-for-browser"
            ? "waiting for sign-in…"
            : st?.connecting
              ? "connecting…"
              : st?.error
                ? "error"
                : st?.connected
                  ? `${st.tools.length} tool${st.tools.length === 1 ? "" : "s"}`
                  : "…";
        return (
          <li
            key={cfg.name}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent/50"
          >
            <Toggle
              on={!off}
              title={off ? "Activate everywhere" : "Deactivate everywhere"}
              onClick={() => void toggleUserServer(cfg)}
            />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">
              {cfg.name}
              <span
                className={cn(
                  "text-muted-foreground",
                  st?.error && !off && "text-destructive",
                  st?.connected && !off && "text-primary",
                )}
              >
                {" "}
                — {detail}
              </span>
            </span>
            {cfg.url ? (
              <span className="shrink-0 font-mono text-xs text-muted-foreground/70">
                remote
              </span>
            ) : null}
            <DeleteButton
              title="Remove server"
              onClick={() => void removeUserServer(cfg.name)}
            />
          </li>
        );
      })}
    </ul>
  );

  const personaList = (
    <ul className="flex flex-col gap-0.5">
      {customAgents.map((a) => {
        const isActive = a.id === activeAgentId;
        return (
          <li
            key={a.id}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent/50"
          >
            <Toggle
              on={isActive}
              title={isActive ? "Active persona" : "Use this persona"}
              onClick={() => setActiveAgentId(a.id)}
            />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">
              {a.name}
              {a.description ? (
                <span className="text-muted-foreground">
                  {" "}
                  — {a.description}
                </span>
              ) : null}
            </span>
            <DeleteButton
              title="Remove persona"
              onClick={() => removeAgent(a.id)}
            />
          </li>
        );
      })}
    </ul>
  );

  const snippetList = (
    <ul className="flex flex-col gap-0.5">
      {snippets.map((sn) => (
        <li
          key={sn.id}
          className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent/50"
        >
          <span className="min-w-0 flex-1 truncate text-xs text-foreground">
            {sn.name || sn.handle}
            {sn.description ? (
              <span className="text-muted-foreground"> — {sn.description}</span>
            ) : null}
          </span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground/80">
            #{sn.handle}
          </span>
          <DeleteButton
            title="Remove snippet"
            onClick={() => removeSnippet(sn.id)}
          />
        </li>
      ))}
    </ul>
  );

  const folderList = (
    <ul className="flex flex-col gap-0.5">
      {activeItems.map((a) => {
        const on = enabledSet.has(a.path);
        return (
          <li
            key={a.path}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent/50"
          >
            {a.kind === "skill" ? (
              <Toggle
                on={on}
                title={
                  on ? "Disable for this project" : "Enable for this project"
                }
                onClick={() => setProjectEnabled(scopeRootKey, a.path, !on)}
              />
            ) : null}
            <NameCell
              name={a.name}
              description={a.description}
              path={a.path}
              onOpen={onOpenFile}
            />
            <span className="min-w-0 max-w-[38%] shrink truncate font-mono text-xs text-muted-foreground/80">
              {a.tool}
            </span>
            {a.kind === "skill" ? (
              <AdoptButton
                done={importedPaths.has(a.path)}
                title={
                  importedPaths.has(a.path)
                    ? "In your library"
                    : "Import to library"
                }
                onClick={() => void importToLibrary(a)}
              />
            ) : a.kind === "agent" ? (
              <AdoptButton
                done={personaNames.has(a.name.toLowerCase())}
                title={
                  personaNames.has(a.name.toLowerCase())
                    ? "Adopted as a persona"
                    : "Adopt as a persona"
                }
                onClick={() => void adoptAsPersona(a)}
              />
            ) : a.kind === "command" ? (
              <AdoptButton
                done={snippetHandles.has(normalizeHandle(a.name))}
                title={
                  snippetHandles.has(normalizeHandle(a.name))
                    ? "Adopted as a snippet"
                    : "Adopt as a snippet"
                }
                onClick={() => void adoptAsSnippet(a)}
              />
            ) : (
              <span className="shrink-0 rounded bg-muted px-1 py-px font-mono text-xs text-muted-foreground">
                {TARGET_NOTE[a.target]}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );

  let body: ReactNode;
  if (scope === "folder" && !result) {
    body = (
      <p className="px-2 py-6 text-center text-xs text-muted-foreground">
        {loading ? "Scanning…" : "Open a folder to detect agent config."}
      </p>
    );
  } else if (tabs.length === 0) {
    body =
      scope === "installed" ? (
        <p className="px-2 py-6 text-center text-xs leading-relaxed text-muted-foreground">
          Nothing installed yet.
          <br />
          Copy skills, servers, agents, or commands from a folder to keep them
          here.
        </p>
      ) : (
        <p className="px-2 py-6 text-center text-xs leading-relaxed text-muted-foreground">
          Nothing recognized here yet.
          <br />
          Drop an <code className="font-mono">AGENTS.md</code> or a{" "}
          <code className="font-mono">.claude/skills/</code> folder in the
          project.
        </p>
      );
  } else if (scope === "installed") {
    body =
      active === "skill"
        ? libraryList
        : active === "mcp"
          ? userServerList
          : active === "agent"
            ? personaList
            : snippetList;
  } else {
    body =
      active === "mcp" ? (
        <McpSection
          artifacts={mcpArtifacts}
          scopeRootKey={scopeRootKey}
          onOpenFile={onOpenFile}
        />
      ) : (
        folderList
      );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        <HugeiconsIcon
          icon={SparklesIcon}
          size={14}
          strokeWidth={1.75}
          className="text-primary"
        />
        <span className="text-xs font-semibold text-foreground">Adopt</span>
        <button
          type="button"
          title="Rescan folder"
          onClick={refresh}
          className="ml-auto grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon
            icon={RefreshIcon}
            size={12}
            strokeWidth={2}
            className={cn(loading && "animate-spin")}
          />
        </button>
      </div>

      {/* Scope: what's installed in Termco vs. what's in this folder. */}
      <div className="flex gap-1 border-b border-border/50 px-2 py-1.5">
        {(
          [
            ["folder", "This folder", artifacts.length],
            ["installed", "Installed", installedTotal],
          ] as const
        ).map(([id, label, n]) => {
          const on = scope === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                on
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {tabs.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-b border-border/50 px-2.5 py-2">
          {tabs.map((t) => {
            const on = active === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "h-[24px] rounded-full border px-[9px] text-xs font-medium transition-colors",
                  on
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {t.label}
                <span className="ml-1 tabular-nums opacity-70">{t.count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">{body}</div>
    </div>
  );
}
