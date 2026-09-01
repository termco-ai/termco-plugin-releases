/**
 * The whole-window agents manager: swaps in for the workspace body (title bar
 * and status bar stay) and hosts the Agents / Snippets / Skills / MCP Servers
 * sections. The single home for managing them — personas, reusable snippets,
 * the skills library, and MCP servers (add one by hand or paste a `.mcp.json`
 * block; connected servers show their live tools). Editor dialogs and the
 * custom-instructions block live here too.
 */

import type {
  AiLibraryAgent as Agent,
  AiLibrarySkill as Skill,
  AiLibrarySnippet as Snippet,
} from "@termco/ai-library-base";
import ui from "@termco/ui";
import { newAgentId, useAgentsStore } from "./store/agentsStore";
import { type McpServerStatus, useMcpStore } from "./store/mcpStore";
import { newSkillId, useSkillsStore } from "./store/skillsStore";
import {
  newSnippetId,
  useSnippetsStore,
} from "./store/snippetsStore";
import {
  Add01Icon,
  AiNetworkIcon,
  Delete02Icon,
  Edit02Icon,
  NoteIcon,
  PlusSignIcon,
  PuzzleIcon,
  Search01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
import { useLibrarySelector } from "./runtime";
import { AgentCard } from "./components/AgentCard";
import { AgentEditorDialog } from "./components/AgentEditorDialog";
import { CustomInstructionsBlock } from "./components/CustomInstructionsBlock";
import { McpServerEditorDialog } from "./components/McpServerEditorDialog";
import { SkillEditorDialog } from "./components/SkillEditorDialog";
import { SnippetEditorDialog } from "./components/SnippetEditorDialog";

const {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  cn,
} = ui;

type SectionId = "agents" | "snippets" | "skills" | "mcp";
type AgentFilterId = "all" | "builtin" | "custom";
type PendingDelete =
  | { kind: "agent"; id: string; name: string }
  | { kind: "snippet"; id: string; name: string }
  | { kind: "skill"; id: string; name: string }
  | { kind: "server"; id: string; name: string };

const AGENT_FILTERS: { id: AgentFilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "builtin", label: "Built-in" },
  { id: "custom", label: "Custom" },
];

const SECTIONS: Record<
  SectionId,
  { title: string; sub: string; action: string | null }
> = {
  agents: {
    title: "Agents",
    sub: "Personas available to the AI in this workspace.",
    action: "New agent",
  },
  snippets: {
    title: "Snippets",
    sub: "Reusable #handle blocks the composer can drop into a prompt.",
    action: "Add snippet",
  },
  skills: {
    title: "Skills",
    sub: "Your library — offered to the agent, loaded on demand when it needs one.",
    action: "New skill",
  },
  mcp: {
    title: "MCP Servers",
    sub: "External tools over the Model Context Protocol.",
    action: "Add server",
  },
};

/** One MCP server row: status dot, tool chips, and a caller-supplied action. */
function McpServerRow({
  name,
  status,
  action,
}: {
  name: string;
  status?: McpServerStatus;
  action?: React.ReactNode;
}) {
  const tools = status?.tools ?? [];
  return (
    <div className="flex items-start gap-3 rounded-[4px] border border-border bg-card p-4">
      <span
        className={cn(
          "mt-1 size-2 shrink-0 rounded-full",
          status?.connected
            ? "bg-primary"
            : status?.error
              ? "bg-destructive"
              : "bg-muted-foreground/50",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {name}
          </span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground/80">
            {status?.authState === "waiting-for-browser"
              ? "waiting for sign-in…"
              : status?.authState
                ? `${status.authState}…`
                : status?.connecting
                  ? "connecting…"
                  : status?.connected
                    ? `${tools.length} tool${tools.length === 1 ? "" : "s"}`
                    : status?.error
                      ? "error"
                      : "offline"}
          </span>
        </div>
        {status?.error ? (
          <div className="mt-0.5 line-clamp-2 text-xs text-destructive/90">
            {status.error}
          </div>
        ) : tools.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {tools.map((t) => (
              <span
                key={t.name}
                title={t.description}
                className="rounded-sm border border-border bg-muted px-1.5 py-px font-mono text-xs text-muted-foreground"
              >
                {t.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function AgentsManagerView({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<SectionId>("agents");
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [mcpEditorOpen, setMcpEditorOpen] = useState(false);
  const [agentQuery, setAgentQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState<AgentFilterId>("all");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );

  const libraryAgents = useAgentsStore((s) => s.all());
  const agents = useMemo(
    () =>
      libraryAgents.filter((agent) => agent.id !== "builtin:plugin-creator"),
    [libraryAgents],
  );
  const activeAgentId = useAgentsStore((s) => s.activeId);
  const setActiveAgentId = useAgentsStore((s) => s.setActiveId);
  const upsertAgent = useAgentsStore((s) => s.upsert);
  const removeAgent = useAgentsStore((s) => s.remove);
  const hydrateAgents = useAgentsStore((s) => s.hydrate);

  const snippets = useSnippetsStore((s) => s.snippets);
  const upsertSnippet = useSnippetsStore((s) => s.upsert);
  const removeSnippet = useSnippetsStore((s) => s.remove);
  const hydrateSnippets = useSnippetsStore((s) => s.hydrate);

  const library = useSkillsStore((s) => s.library);
  const libraryDisabled = useSkillsStore((s) => s.libraryDisabled);
  const toggleLibrary = useSkillsStore((s) => s.toggleLibrary);
  const removeFromLibrary = useSkillsStore((s) => s.removeFromLibrary);
  const importSkill = useSkillsStore((s) => s.importSkill);
  const hydrateSkills = useSkillsStore((s) => s.hydrate);

  const mcpStatus = useMcpStore((s) => s.status);
  const userServers = useMcpStore((s) => s.userServers);
  const addUserServers = useMcpStore((s) => s.addUserServers);
  const removeUserServer = useMcpStore((s) => s.removeUserServer);
  const disconnectServer = useMcpStore((s) => s.disconnectServer);
  const signOutServer = useMcpStore((s) => s.signOut);
  const hydrateMcp = useMcpStore((s) => s.hydrate);
  const userServerNames = useMemo(
    () => new Set(userServers.map((s) => s.name)),
    [userServers],
  );
  // Folder-connected servers that the user didn't add by hand (read-only here).
  const discoveredServers = useMemo(
    () =>
      Object.entries(mcpStatus)
        .filter(([name]) => !userServerNames.has(name))
        .map(([name, st]) => ({ name, ...st })),
    [mcpStatus, userServerNames],
  );

  const customInstructions = useLibrarySelector((s) => s.customInstructions);

  const visibleAgents = useMemo(() => {
    const q = agentQuery.trim().toLowerCase();
    return agents.filter((a) => {
      if (agentFilter === "builtin" && !a.builtIn) return false;
      if (agentFilter === "custom" && a.builtIn) return false;
      if (!q) return true;
      return [a.name, a.description, a.model ?? ""].some((v) =>
        v.toLowerCase().includes(q),
      );
    });
  }, [agents, agentQuery, agentFilter]);

  useEffect(() => {
    void hydrateAgents();
    void hydrateSnippets();
    void hydrateSkills();
    void hydrateMcp();
  }, [hydrateAgents, hydrateSnippets, hydrateSkills, hydrateMcp]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = SECTIONS[section];
  const counts: Record<SectionId, number> = {
    agents: agents.length,
    snippets: snippets.length,
    skills: library.length,
    mcp: Object.values(mcpStatus).filter((s) => s.connected).length,
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "agent") removeAgent(pendingDelete.id);
    if (pendingDelete.kind === "snippet") removeSnippet(pendingDelete.id);
    if (pendingDelete.kind === "skill") removeFromLibrary(pendingDelete.id);
    if (pendingDelete.kind === "server") {
      void removeUserServer(pendingDelete.id);
    }
    setPendingDelete(null);
  };

  const nav: { id: SectionId; name: string; icon: typeof SparklesIcon }[] = [
    { id: "agents", name: "Agents", icon: AiNetworkIcon },
    { id: "snippets", name: "Snippets", icon: SparklesIcon },
    { id: "skills", name: "Skills", icon: PuzzleIcon },
    { id: "mcp", name: "MCP Servers", icon: NoteIcon },
  ];

  const startNewAgent = () =>
    setEditingAgent({
      id: newAgentId(),
      name: "New agent",
      description: "",
      instructions: "",
      icon: "spark",
      builtIn: false,
    });

  const startNewSnippet = () =>
    setEditingSnippet({
      id: newSnippetId(),
      handle: "",
      name: "",
      description: "",
      content: "",
    });

  const startNewSkill = () =>
    setEditingSkill({
      id: newSkillId(),
      name: "",
      description: "",
      body: "",
      source: { origin: "global" },
    });

  const headerAction =
    section === "agents"
      ? startNewAgent
      : section === "snippets"
        ? startNewSnippet
        : section === "skills"
          ? startNewSkill
          : () => setMcpEditorOpen(true);

  return (
    <div
      data-onboarding-target="agents-manager.overview"
      className="termco-workspace flex min-h-0 flex-1 max-[640px]:flex-col"
      data-agents-manager
      data-testid="agents-manager"
    >
      {/* Left nav */}
      <div
        data-onboarding-target="agents-manager.navigation"
        className="termco-panel flex w-60 shrink-0 flex-col gap-1 border-r border-border/70 px-3 py-4 max-[640px]:w-full max-[640px]:flex-row max-[640px]:overflow-x-auto max-[640px]:border-r-0 max-[640px]:border-b max-[640px]:px-2 max-[640px]:py-2"
      >
        <div className="termco-section-label px-2 pb-2 max-[640px]:hidden">
          Manage
        </div>
        {nav.map((n) => {
          const active = section === n.id;
          return (
            <button
              key={n.id}
              data-onboarding-target={`agents-manager.section.${n.id}`}
              type="button"
              onClick={() => setSection(n.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors max-[640px]:shrink-0",
                active
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <HugeiconsIcon icon={n.icon} size={16} strokeWidth={1.6} />
              <span className="flex-1 text-left">{n.name}</span>
              <span
                className={cn(
                  "font-mono text-xs",
                  active ? "text-primary/70" : "text-muted-foreground/70",
                )}
              >
                {counts[n.id]}
              </span>
            </button>
          );
        })}
        <div className="mt-auto border-t border-border/60 px-2 pt-3 text-xs leading-relaxed text-muted-foreground/70 max-[640px]:hidden">
          More surfaces — Hooks, Rules, Datasets — land here as they ship.
        </div>
      </div>

      {/* Content */}
      <div className="termco-workspace flex min-w-0 flex-1 flex-col">
        <div className="termco-toolbar flex h-14 shrink-0 items-center gap-3 border-b border-border/70 px-6 max-[640px]:px-4">
          <div className="min-w-0 flex-1">
            <div className="font-heading text-base font-semibold text-foreground">
              {meta.title}
            </div>
            <div className="text-xs text-muted-foreground">{meta.sub}</div>
          </div>
          {meta.action ? (
            <Button
              size="sm"
              className="gap-1.5 text-xs"
              onClick={headerAction}
            >
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2.2} />
              {meta.action}
            </Button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6 max-[640px]:p-3">
          {section === "agents" && (
            <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative h-[30px] w-[260px] shrink-0 max-[640px]:w-full">
                  <HugeiconsIcon
                    icon={Search01Icon}
                    size={12}
                    strokeWidth={1.75}
                    className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    value={agentQuery}
                    onChange={(e) => setAgentQuery(e.target.value)}
                    placeholder="Filter agents…"
                    className="termco-focus-ring h-8 w-full rounded-md border border-border bg-card pr-2.5 pl-[30px] text-xs text-foreground outline-none placeholder:text-muted-foreground/80"
                  />
                </div>
                {AGENT_FILTERS.map((f) => {
                  const on = agentFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setAgentFilter(f.id)}
                      className={cn(
                        "h-7 rounded-md border px-3 text-xs font-medium transition-colors",
                        on
                          ? "border-ring bg-ring text-white"
                          : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground",
                      )}
                    >
                      {f.label}
                    </button>
                  );
                })}
                <span className="ml-auto font-mono text-xs text-muted-foreground/70">
                  {visibleAgents.length}{" "}
                  {visibleAgents.length === 1 ? "agent" : "agents"}
                </span>
              </div>

              {visibleAgents.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 rounded-[4px] border border-dashed border-border p-8 text-center">
                  <span className="text-xs font-medium text-foreground/85">
                    No agents match{agentQuery ? ` "${agentQuery}"` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Try a different name, model, or tool — or clear the filter.
                  </span>
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                {visibleAgents.map((a) => (
                  <AgentCard
                    key={a.id}
                    agent={a}
                    active={a.id === activeAgentId}
                    onActivate={() => setActiveAgentId(a.id)}
                    onEdit={() => setEditingAgent(a)}
                    onDelete={
                      a.builtIn
                        ? null
                        : () =>
                            setPendingDelete({
                              kind: "agent",
                              id: a.id,
                              name: a.name,
                            })
                    }
                  />
                ))}
                <button
                  data-onboarding-target="agents-manager.new-agent"
                  type="button"
                  onClick={startNewAgent}
                  className="flex min-h-16 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-[var(--signal-soft)] hover:text-primary"
                >
                  <HugeiconsIcon
                    icon={PlusSignIcon}
                    size={16}
                    strokeWidth={1.9}
                  />
                  New agent
                </button>
              </div>

              <CustomInstructionsBlock value={customInstructions} />
            </div>
          )}

          {section === "snippets" && (
            <div className="grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2">
              {snippets.map((sn) => (
                <div
                  key={sn.id}
                  className="flex items-start gap-3 rounded-lg border border-border/70 bg-card p-4 shadow-[var(--shadow-control)]"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <HugeiconsIcon
                      icon={SparklesIcon}
                      size={17}
                      strokeWidth={1.6}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground">
                      {sn.name}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {sn.description || sn.content}
                    </div>
                    <div className="mt-1.5 font-mono text-xs text-muted-foreground/70">
                      #{sn.handle}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => setEditingSnippet(sn)}
                      title="Edit snippet"
                    >
                      <HugeiconsIcon
                        icon={Edit02Icon}
                        size={12}
                        strokeWidth={1.75}
                      />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setPendingDelete({
                          kind: "snippet",
                          id: sn.id,
                          name: sn.name,
                        })
                      }
                      title="Delete snippet"
                    >
                      <HugeiconsIcon
                        icon={Delete02Icon}
                        size={12}
                        strokeWidth={1.75}
                      />
                    </Button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={startNewSnippet}
                className="flex min-h-[74px] items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-[var(--signal-soft)] hover:text-primary"
              >
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  size={15}
                  strokeWidth={1.9}
                />
                Add a snippet
              </button>
            </div>
          )}

          {section === "skills" && (
            <div className="grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2">
              {library.map((sk) => {
                const on = !libraryDisabled.includes(sk.id);
                return (
                  <div
                    key={sk.id}
                    className="flex items-start gap-3 rounded-lg border border-border/70 bg-card p-4 shadow-[var(--shadow-control)]"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <HugeiconsIcon
                        icon={PuzzleIcon}
                        size={17}
                        strokeWidth={1.6}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {sk.name}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-px text-xs font-medium",
                            on
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {on ? "Enabled" : "Off"}
                        </span>
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {sk.description || sk.whenToUse || "No description"}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleLibrary(sk.id)}
                        className="mt-1.5 font-mono text-xs text-muted-foreground/80 hover:text-foreground"
                      >
                        {on ? "Disable everywhere" : "Enable everywhere"}
                      </button>
                    </div>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => setEditingSkill(sk)}
                        title="Edit skill"
                      >
                        <HugeiconsIcon
                          icon={Edit02Icon}
                          size={12}
                          strokeWidth={1.75}
                        />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setPendingDelete({
                            kind: "skill",
                            id: sk.id,
                            name: sk.name,
                          })
                        }
                        title="Remove from library"
                      >
                        <HugeiconsIcon
                          icon={Delete02Icon}
                          size={12}
                          strokeWidth={1.75}
                        />
                      </Button>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={startNewSkill}
                className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-[var(--signal-soft)] hover:text-primary"
              >
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  size={15}
                  strokeWidth={1.9}
                />
                New skill
              </button>
              {library.length === 0 ? (
                <p className="col-span-2 px-1 text-xs leading-relaxed text-muted-foreground/70">
                  Author a skill here, or import one a project ships (a{" "}
                  <code className="font-mono">.claude/skills/</code> folder)
                  from the <span className="font-medium">Adopt</span> panel in
                  the sidebar.
                </p>
              ) : null}
            </div>
          )}

          {section === "mcp" && (
            <div className="flex max-w-3xl flex-col gap-4">
              {userServers.length === 0 && discoveredServers.length === 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setMcpEditorOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border p-8 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-[var(--signal-soft)] hover:text-primary"
                  >
                    <HugeiconsIcon
                      icon={PlusSignIcon}
                      size={15}
                      strokeWidth={1.9}
                    />
                    Add an MCP server
                  </button>
                  <p className="text-center text-xs text-muted-foreground/70">
                    Add one here (it's offered in every chat), or connect a
                    folder's <code className="font-mono">.mcp.json</code> from
                    the <span className="font-medium">Adopt</span> panel in the
                    sidebar.
                  </p>
                </>
              ) : null}

              {userServers.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <div className="termco-section-label font-mono">
                    Your servers · {userServers.length}
                  </div>
                  {userServers.map((cfg) => (
                    <McpServerRow
                      key={cfg.name}
                      name={cfg.name}
                      status={mcpStatus[cfg.name]}
                      action={
                        <div className="flex shrink-0 items-center gap-0.5">
                          {cfg.url ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => void signOutServer(cfg.name)}
                              title="Clear stored OAuth tokens"
                            >
                              Sign out
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              setPendingDelete({
                                kind: "server",
                                id: cfg.name,
                                name: cfg.name,
                              })
                            }
                            title="Remove server"
                          >
                            Remove
                          </Button>
                        </div>
                      }
                    />
                  ))}
                </section>
              ) : null}

              {discoveredServers.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <div className="termco-section-label font-mono">
                    From an open folder · {discoveredServers.length}
                  </div>
                  {discoveredServers.map((sv) => (
                    <McpServerRow
                      key={sv.name}
                      name={sv.name}
                      status={sv}
                      action={
                        sv.connected ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 shrink-0 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => void disconnectServer(sv.name)}
                            title="Disconnect"
                          >
                            Disconnect
                          </Button>
                        ) : null
                      }
                    />
                  ))}
                </section>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <AgentEditorDialog
        agent={editingAgent}
        existing={agents.filter((agent) => !agent.builtIn)}
        onClose={() => setEditingAgent(null)}
        onSave={(a) => {
          upsertAgent(a);
          setEditingAgent(null);
        }}
      />
      <SnippetEditorDialog
        snippet={editingSnippet}
        existing={snippets}
        onClose={() => setEditingSnippet(null)}
        onSave={(s) => {
          upsertSnippet(s);
          setEditingSnippet(null);
        }}
      />
      <SkillEditorDialog
        skill={editingSkill}
        existing={library}
        onClose={() => setEditingSkill(null)}
        onSave={(s) => {
          importSkill(s);
          setEditingSkill(null);
        }}
      />
      <McpServerEditorDialog
        open={mcpEditorOpen}
        existingNames={userServers.map((s) => s.name)}
        onClose={() => setMcpEditorOpen(false)}
        onSave={(servers) => {
          void addUserServers(servers);
          setMcpEditorOpen(false);
        }}
      />
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {pendingDelete?.kind ?? "item"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.name}” will be permanently removed from Termco.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
