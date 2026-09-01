import type {
  LspServerConfig,
  LspServerListEntry,
  LspSessionsCapability,
  LspSessionStatus,
} from "@termco/editor-base";
import type { PluginModule } from "@termco/kernel";
import type {
  UiSettingsSectionContribution,
  UiSettingsSectionRegistry,
} from "@termco/ui-settings-base";
import ui from "@termco/ui";
import { SourceCodeIcon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { draftFromServer, serverFromDraft, type ServerDraft } from "./model";
import { LSP_SESSIONS_SERVICE } from "@termco/editor-base";
import { UI_SETTINGS_SECTIONS_SERVICE } from "@termco/ui-settings-base";

const { useCallback, useEffect, useState } = ui.React;

function SettingsSection({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      {action ? (
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="termco-section-label">{label}</div>
          {action}
        </div>
      ) : (
        <div className="termco-section-label mb-2">{label}</div>
      )}
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-control)]">
        {children}
      </div>
    </section>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-t border-border px-4 py-(--settings-row-pad) first:border-t-0 hover:bg-accent/35">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium text-sm">{title}</span>
        {description ? <span className="text-xs leading-[1.5] text-muted-foreground">{description}</span> : null}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: LspServerListEntry["status"] }) {
  if (status === "running") {
    return <ui.Badge className="bg-emerald-500/15 text-emerald-500">running</ui.Badge>;
  }
  if (status === "installed") return <ui.Badge variant="secondary">installed</ui.Badge>;
  if (status === "found") return <ui.Badge variant="secondary">found on PATH</ui.Badge>;
  return <ui.Badge variant="outline">not installed</ui.Badge>;
}

function ServerRow({
  entry,
  busy,
  onEdit,
  onInstall,
  onRemove,
  onToggle,
}: {
  entry: LspServerListEntry;
  busy: boolean;
  onEdit(): void;
  onInstall(): void;
  onRemove(): void;
  onToggle(enabled: boolean): void;
}) {
  const { config, status, detail } = entry;
  const description = [
    config.languages.map((language) => `.${language}`).join(" "),
    config.projectMarkers?.length ? `only with ${config.projectMarkers[0]}` : null,
    config.role === "secondary" ? "runs alongside the primary server" : null,
    detail,
  ].filter(Boolean).join(" — ");

  return (
    <SettingRow
      title={<span className="flex items-center gap-2">{config.name}<StatusBadge status={status} /></span>}
      description={description}
    >
      <div className="flex items-center gap-2">
        {config.autoInstall && status === "missing" ? (
          <ui.Button size="sm" variant="outline" disabled={busy} onClick={onInstall}>
            {busy ? "Installing…" : "Install"}
          </ui.Button>
        ) : null}
        {config.custom ? (
          <>
            <ui.Button size="sm" variant="ghost" onClick={onEdit}>Edit</ui.Button>
            <ui.Button size="sm" variant="ghost" className="text-destructive" onClick={onRemove}>Remove</ui.Button>
          </>
        ) : null}
        <ui.Switch
          checked={config.enabled}
          disabled={busy}
          onCheckedChange={onToggle}
        />
      </div>
    </SettingRow>
  );
}

function ServerDialog({
  open,
  initial,
  busy,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  initial: LspServerConfig | null;
  busy: boolean;
  onOpenChange(open: boolean): void;
  onSave(server: LspServerConfig): Promise<void>;
}) {
  const [draft, setDraft] = useState<ServerDraft>(() => draftFromServer(initial));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setDraft(draftFromServer(initial));
    setError(null);
  }, [open, initial]);
  const change = (key: keyof ServerDraft, value: string | boolean) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    try {
      await onSave(serverFromDraft(draft, initial?.enabled ?? true));
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const input = (id: string, key: keyof ServerDraft, label: string, placeholder: string, disabled = false) => (
    <label className="flex flex-col gap-1 text-xs" htmlFor={id}>
      {label}
      <ui.Input id={id} value={String(draft[key])} disabled={disabled} placeholder={placeholder} onChange={(event) => change(key, event.target.value)} />
    </label>
  );
  return (
    <ui.Dialog open={open} onOpenChange={onOpenChange}>
      <ui.DialogContent className="max-w-lg">
        <ui.DialogHeader>
          <ui.DialogTitle>{initial ? "Edit language server" : "Add language server"}</ui.DialogTitle>
          <ui.DialogDescription>Any LSP server speaking stdio works — the command is spawned per project root.</ui.DialogDescription>
        </ui.DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            {input("lsp-id", "id", "Id", "elixir-ls", Boolean(initial))}
            {input("lsp-name", "name", "Name", "Elixir LS")}
          </div>
          {input("lsp-languages", "languages", "File extensions (comma-separated)", "ex, exs")}
          <div className="grid grid-cols-2 gap-3">
            {input("lsp-command", "command", "Command", "elixir-ls")}
            {input("lsp-args", "args", "Arguments", "--stdio")}
          </div>
          {input("lsp-root-markers", "rootMarkers", "Root markers (comma-separated)", "mix.exs, .git")}
          {input("lsp-project-markers", "projectMarkers", "Only in projects containing (comma-separated, empty = everywhere)", "angular.json")}
          <label className="flex items-center gap-2 text-xs" htmlFor="lsp-secondary">
            <input id="lsp-secondary" type="checkbox" checked={draft.secondary} onChange={(event) => change("secondary", event.target.checked)} />
            Secondary (runs alongside the primary server, merges diagnostics)
          </label>
          <label className="flex flex-col gap-1 text-xs" htmlFor="lsp-init-options">
            Initialization options (JSON)
            <ui.Textarea id="lsp-init-options" value={draft.initializationOptions} onChange={(event) => change("initializationOptions", event.target.value)} rows={3} className="font-mono text-xs" placeholder="{ }" />
          </label>
          <label className="flex flex-col gap-1 text-xs" htmlFor="lsp-settings">
            Settings (JSON, sent via workspace/didChangeConfiguration)
            <ui.Textarea id="lsp-settings" value={draft.settings} onChange={(event) => change("settings", event.target.value)} rows={3} className="font-mono text-xs" placeholder="{ }" />
          </label>
          {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        </div>
        <ui.DialogFooter>
          <ui.Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</ui.Button>
          <ui.Button disabled={busy} onClick={() => void save()}>{initial ? "Save" : "Add server"}</ui.Button>
        </ui.DialogFooter>
      </ui.DialogContent>
    </ui.Dialog>
  );
}

export function createLanguagesSettings(lsp: LspSessionsCapability) {
  return function LanguagesSettings() {
    const [servers, setServers] = useState<LspServerListEntry[]>([]);
    const [sessions, setSessions] = useState<LspSessionStatus[]>([]);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<LspServerConfig | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const refresh = useCallback(async () => {
      const [nextServers, nextSessions] = await Promise.all([lsp.listServers(), lsp.sessionStatus()]);
      setServers(nextServers);
      setSessions(nextSessions);
    }, []);
    useEffect(() => {
      void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
      const timer = window.setInterval(() => void refresh(), 2000);
      return () => window.clearInterval(timer);
    }, [refresh]);
    const action = async (id: string, operation: () => Promise<unknown>) => {
      setBusy(id);
      setError(null);
      try { await operation(); await refresh(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
      finally { setBusy(null); }
    };
    const liveSessions = sessions.filter((session) => session.state !== "stopped");
    return (
      <div data-testid="languages-settings-section" className="flex flex-col gap-[22px]">
        <SettingsSection
          label="Language servers"
          action={<ui.Button size="sm" variant="outline" className="h-7 rounded-md px-2.5 text-xs" onClick={() => { setEditing(null); setDialogOpen(true); }}>Add custom server</ui.Button>}
        >
          {servers.map((entry) => (
            <ServerRow
              key={entry.config.id}
              entry={entry}
              busy={busy === entry.config.id}
              onEdit={() => { setEditing(entry.config); setDialogOpen(true); }}
              onInstall={() => void action(entry.config.id, () => lsp.installServer(entry.config.id))}
              onRemove={() => void action(entry.config.id, () => lsp.removeServer(entry.config.id))}
              onToggle={(enabled) => void action(entry.config.id, () => lsp.setServerEnabled(entry.config.id, enabled))}
            />
          ))}
        </SettingsSection>
        {liveSessions.length > 0 ? (
          <SettingsSection label="Active sessions">
            {liveSessions.map((session) => (
              <SettingRow
                key={session.sessionKey}
                title={`${session.serverId} — ${session.root}`}
                description={[session.scopeKey !== "local" ? session.scopeKey : null, session.state, `${session.openDocs} file${session.openDocs === 1 ? "" : "s"}`, session.lastError].filter(Boolean).join(" · ")}
              >
                <ui.Button size="sm" variant="ghost" onClick={() => void action(session.sessionKey, () => lsp.restartSession(session.sessionKey))}>Restart</ui.Button>
              </SettingRow>
            ))}
          </SettingsSection>
        ) : null}
        <ServerDialog open={dialogOpen} initial={editing} busy={busy === "dialog"} onOpenChange={setDialogOpen} onSave={(server) => action("dialog", () => lsp.upsertServer(server))} />
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      </div>
    );
  };
}

const plugin: PluginModule = {
  inject: [
    LSP_SESSIONS_SERVICE,
    UI_SETTINGS_SECTIONS_SERVICE,
  ],
  async activate(context) {
    const contribution: UiSettingsSectionContribution = {
      id: "languages", label: "Languages", description: "Language servers for diagnostics, hover, and completions.", category: "Workspace", order: 50,
      icon: SourceCodeIcon,
      Component: createLanguagesSettings(context.get<LspSessionsCapability>("lsp.sessions")),
      searchEntries: [{ title: "Language servers", description: "Diagnostics, hover, and completions", keywords: "lsp typescript pyright rust" }],
    };
    await context.effect(() =>
      context
        .get<UiSettingsSectionRegistry>("ui.settings.sections")
        .register(contribution, { pluginId: "languages-settings", generation: context.generation, key: contribution.id }),
    );
  },
};
export default plugin;
