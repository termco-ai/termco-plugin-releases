import {
  AiChat01Icon,
  Download01Icon,
  GitPullRequestIcon,
  LinkSquare01Icon,
  Login01Icon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type {
  ForgeRepository,
  ForgeRepositoryState,
  ForgeReviewSummary,
  ForgeReviewsCapability,
} from "@termco/forge-reviews-base";
import type { SourceControlSectionProps } from "@termco/git-base";
import type { WorkspaceTabsCapability } from "@termco/workspace-base";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@termco/ui";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { openForgeReviewTab } from "./tabs";
import { startReviewConversation } from "./reviewChat";

type Props = SourceControlSectionProps & {
  forge: ForgeReviewsCapability;
  sessions(): AiSessionsCapability | undefined;
  desktop(): DesktopIntegrationCapability | undefined;
  tabs: WorkspaceTabsCapability;
};

type ViewState = {
  repository: ForgeRepositoryState | null;
  reviews: ForgeReviewSummary[];
  truncated: boolean;
  loading: boolean;
  listError: string | null;
};

function safeReviewUrl(repository: ForgeRepository, raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    return url.hostname.toLowerCase() === repository.host.toLowerCase() ? url.toString() : null;
  } catch {
    return null;
  }
}

function statusTone(state: string): string {
  const normalized = state.toLowerCase();
  if (["approved", "success"].some((part) => normalized.includes(part))) {
    return "text-emerald-600 dark:text-emerald-400";
  }
  if (["changes_requested", "blocked", "fail"].some((part) => normalized.includes(part))) {
    return "text-destructive";
  }
  return "text-muted-foreground";
}

/** "changes_requested" → "Changes requested". */
function humanize(value: string): string {
  const spaced = value.replaceAll("_", " ").trim().toLowerCase();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : value;
}

/** "3m", "2h", "5d", else a short date. Empty when unknown. */
function relativeTime(value: string | null, now = Date.now()): string {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  const minutes = Math.max(0, Math.round((now - time) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(time);
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function SectionNotice({
  title,
  body,
  tone = "muted",
  action,
}: {
  title: string;
  body?: string;
  tone?: "muted" | "error";
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className="flex flex-col items-center gap-1.5 px-6 py-6 text-center"
    >
      <p className={cn("text-xs font-medium", tone === "error" ? "text-destructive" : "text-foreground")}>
        {title}
      </p>
      {body ? <p className="max-w-64 text-xs leading-5 text-muted-foreground">{body}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

function SetupState({
  state,
  checking,
  onCheckAgain,
  onInstall,
  onLogin,
  onOpenGuide,
  location,
  wsl,
}: {
  state: Extract<ForgeRepositoryState, { kind: "cli-missing" | "not-authenticated" }>;
  checking: boolean;
  onCheckAgain: () => void;
  onInstall: () => void;
  onLogin: () => void;
  onOpenGuide: () => void;
  location: string;
  wsl: boolean;
}) {
  const missing = state.kind === "cli-missing";
  const command = missing ? state.install.command : state.loginCommand;
  return (
    <div className="space-y-2.5 px-3 pb-3 pt-2 text-xs">
      <p className="font-medium text-foreground">
        {missing ? `${state.repository.providerLabel} CLI not found` : `Connect to ${state.repository.providerLabel}`}
      </p>
      <p className="leading-5 text-muted-foreground">
        {missing
          ? `Install ${state.repository.cli} ${location} to load and review ${state.repository.reviewNoun}s.`
          : `Sign in to ${state.repository.host} with ${state.repository.cli}. Credentials stay with the CLI.`}
      </p>
      {missing ? <p className="leading-5 text-muted-foreground">
        {wsl ? "Checked the login-shell PATH inside WSL." : "Checked your terminal PATH and common installation locations."}
      </p> : null}
      {command ? (
        <code className="block min-w-0 overflow-x-auto rounded-md bg-muted px-2 py-1.5 font-mono text-xs leading-5 text-foreground">
          {command}
        </code>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {missing && command ? (
          <Button size="xs" onClick={onInstall}>
            <HugeiconsIcon icon={Download01Icon} size={12} strokeWidth={1.9} />
            Install in terminal
          </Button>
        ) : null}
        {!missing ? (
          <Button size="xs" onClick={onLogin}>
            <HugeiconsIcon icon={Login01Icon} size={12} strokeWidth={1.9} />
            Sign in via terminal
          </Button>
        ) : null}
        {missing ? (
          <Button size="xs" variant={command ? "ghost" : "default"} onClick={onOpenGuide}>
            Installation guide
          </Button>
        ) : null}
        <Button size="xs" variant="ghost" disabled={checking} onClick={onCheckAgain}>
          {checking ? (
            <Spinner className="size-3" />
          ) : (
            <HugeiconsIcon icon={Refresh01Icon} size={12} />
          )}
          Check again
        </Button>
      </div>
      <p className="leading-5 text-muted-foreground">
        {missing && !command ? "No supported package manager was found. Follow the installation guide, then select Check again." : "When the terminal step is finished, select Check again."}
      </p>
    </div>
  );
}

function ReviewRow({
  review,
  repository,
  canChat,
  onOpen,
  onSelect,
  onChat,
}: {
  review: ForgeReviewSummary;
  repository: ForgeRepository;
  canChat: boolean;
  onOpen: (url: string) => void;
  onSelect: (review: ForgeReviewSummary) => void;
  onChat: (review: ForgeReviewSummary) => void;
}) {
  const reviewUrl = safeReviewUrl(repository, review.url);
  const updated = relativeTime(review.updatedAt);
  return (
    <div className="group mx-1 min-w-0 rounded-md px-2 py-2 hover:bg-accent/40 focus-within:bg-accent/40">
      <button type="button" onClick={() => onSelect(review)}
        className="flex w-full min-w-0 items-start gap-1.5 rounded-sm text-left text-xs font-medium leading-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
        title={`${review.title} · Open ${repository.reviewNoun} #${review.number} in a review tab`}>
        <HugeiconsIcon icon={GitPullRequestIcon} size={13} strokeWidth={1.8} className="mt-0.5 shrink-0 text-muted-foreground" />
        <span className="line-clamp-2">{review.title}</span>
      </button>
      <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="shrink-0 tabular-nums">#{review.number}</span>
        <span className="min-w-0 flex-1 truncate" title={review.author.login}>{review.author.login}</span>
        {updated ? <time className="shrink-0 tabular-nums" dateTime={review.updatedAt ?? undefined}
          title={review.updatedAt ? new Date(review.updatedAt).toLocaleString() : undefined}>{updated}</time> : null}
      </div>
      <div className="flex min-h-6 items-center gap-1.5 text-xs">
        <span className={cn("min-w-0 flex-1 truncate", statusTone(review.reviewStatus ?? ""))}>
          {[review.draft ? "Draft" : null, review.reviewStatus ? humanize(review.reviewStatus) : null].filter(Boolean).join(" · ")}
        </span>
        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <IconButton label="Open in browser" disabled={!reviewUrl} onClick={() => reviewUrl && onOpen(reviewUrl)}>
            <HugeiconsIcon icon={LinkSquare01Icon} size={13} strokeWidth={1.85} />
          </IconButton>
          <IconButton label="Review in chat" disabled={!canChat} onClick={() => onChat(review)}>
            <HugeiconsIcon icon={AiChat01Icon} size={13} strokeWidth={1.85} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

export function ReviewsSection({
  repoRoot,
  workspace,
  runInNewTerminal,
  forge,
  sessions,
  desktop,
  tabs,
}: Props) {
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const requestRevision = useRef(0);
  const [view, setView] = useState<ViewState>({
    repository: null,
    reviews: [],
    truncated: false,
    loading: true,
    listError: null,
  });

  const load = useCallback(
    async (refresh: boolean) => {
      const revision = ++requestRevision.current;
      setView((current) => ({ ...current, loading: true, listError: null }));
      try {
        const repository = await forge.repository({ repoRoot, workspace, refresh });
        if (revision !== requestRevision.current) return;
        if (repository.kind !== "ready") {
          setView({ repository, reviews: [], truncated: false, loading: false, listError: null });
          return;
        }
        try {
          const list = await forge.listOpen({
            repository: repository.repository,
            workspace,
            refresh,
          });
          if (revision !== requestRevision.current) return;
          setView({
            repository,
            reviews: list.reviews,
            truncated: list.truncated,
            loading: false,
            listError: null,
          });
        } catch (error) {
          if (revision !== requestRevision.current) return;
          setView({
            repository,
            reviews: [],
            truncated: false,
            loading: false,
            listError: error instanceof Error ? error.message : String(error),
          });
        }
      } catch (error) {
        if (revision !== requestRevision.current) return;
        setView({
          repository: {
            kind: "error",
            repository: null,
            message: error instanceof Error ? error.message : String(error),
          },
          reviews: [],
          truncated: false,
          loading: false,
          listError: null,
        });
      }
    },
    [forge, repoRoot, workspace],
  );

  useEffect(() => {
    void load(false);
    return () => {
      requestRevision.current += 1;
    };
  }, [load]);

  const repository =
    view.repository?.kind === "ready"
      ? view.repository.repository
      : view.repository?.kind === "cli-missing" || view.repository?.kind === "not-authenticated"
        ? view.repository.repository
        : null;
  const installCommand =
    view.repository?.kind === "cli-missing" ? view.repository.install.command : null;
  const loginCommand =
    view.repository?.kind === "cli-missing" || view.repository?.kind === "not-authenticated"
      ? view.repository.loginCommand
      : null;
  const ready = view.repository?.kind === "ready";
  const setupLocation = workspace?.kind === "ssh" ? "on the SSH host" : workspace?.kind === "wsl" ? "inside WSL" : "on this computer";
  const startSetup = async (command: string) => {
    setSetupError(null);
    try {
      await runInNewTerminal(command, repoRoot);
    } catch (error) {
      setSetupError(`Couldn’t open the setup terminal: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  useEffect(() => {
    setQuery("");
    setInstallDialogOpen(false);
    setSetupError(null);
  }, [repoRoot, workspace]);
  const queryText = query.trim().toLowerCase().replace(/^#/, "");
  const visibleReviews = view.reviews.filter((review) =>
    !queryText || `${review.number} ${review.title} ${review.author.login}`.toLowerCase().includes(queryText));

  const openUrl = (url: string) => {
    void desktop()?.openUrl(url);
  };
  const reviewInChat = (review: ForgeReviewSummary) => {
    if (!repository) return;
    const ai = sessions();
    if (!ai) return;
    const location = openForgeReviewTab(tabs, repository, review);
    startReviewConversation(ai, { repository, review, rigId: location.rigId });
  };
  const selectReview = (review: ForgeReviewSummary) => {
    if (repository) openForgeReviewTab(tabs, repository, review);
  };

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="termco-toolbar flex h-8 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">
          Open reviews
        </span>
        {ready && !view.loading ? (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border/60 px-1 text-xs font-semibold tabular-nums text-muted-foreground">
            {view.reviews.length}
            {view.truncated ? "+" : ""}
          </span>
        ) : null}
        {repository ? (
          <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
            {repository.providerLabel}
          </span>
        ) : null}
        <div className={cn("shrink-0", !repository && "ml-auto")}>
          <IconButton label="Refresh reviews" disabled={view.loading} onClick={() => void load(true)}>
            {view.loading ? (
              <Spinner className="size-3" />
            ) : (
              <HugeiconsIcon icon={Refresh01Icon} size={13} />
            )}
          </IconButton>
        </div>
      </div>

      {ready && view.reviews.length > 0 ? <div className="shrink-0 border-b border-border/60 px-2 py-2">
        <Input aria-label="Find a review" placeholder="Find a review…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 text-xs" />
      </div> : null}
      <div className="min-h-0 flex-1 overflow-hidden">
        {view.loading && !view.repository ? (
          <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
            <Spinner className="size-3" /> Checking hosted reviews…
          </div>
        ) : null}

        {view.repository?.kind === "cli-missing" ||
        view.repository?.kind === "not-authenticated" ? (
          <SetupState
            state={view.repository}
            location={setupLocation}
            wsl={workspace?.kind === "wsl"}
            checking={view.loading}
            onCheckAgain={() => void load(true)}
            onInstall={() => setInstallDialogOpen(true)}
            onLogin={() => {
              if (loginCommand) void startSetup(loginCommand);
            }}
            onOpenGuide={() => {
              if (view.repository?.kind === "cli-missing")
                openUrl(view.repository.install.documentationUrl);
            }}
          />
        ) : null}

        {setupError ? <p role="alert" className="px-3 py-2 text-xs text-destructive">{setupError}</p> : null}
        {view.repository?.kind === "unsupported" ? (
          <SectionNotice
            title="No compatible review host"
            body={view.repository.message}
            action={
              <Button size="xs" variant="ghost" onClick={() => void load(true)}>
                Check again
              </Button>
            }
          />
        ) : null}

        {view.repository?.kind === "error" ? (
          <SectionNotice
            title="Couldn’t check hosted reviews"
            body={view.repository.message}
            tone="error"
            action={
              <Button size="xs" variant="outline" onClick={() => void load(true)}>
                Check again
              </Button>
            }
          />
        ) : null}

        {ready && view.listError ? (
          <SectionNotice
            title={`Couldn’t list open ${view.repository?.kind === "ready" ? view.repository.repository.reviewNoun : "review"}s`}
            body={view.listError}
            tone="error"
            action={
              <Button size="xs" variant="outline" onClick={() => void load(true)}>
                Retry
              </Button>
            }
          />
        ) : null}

        {view.repository?.kind === "ready" &&
        !view.listError &&
        !view.loading &&
        view.reviews.length === 0 ? (
          <SectionNotice
            title={`No open ${view.repository.repository.reviewNoun}s.`}
            body={`${view.repository.repository.slug} has nothing waiting for review.`}
          />
        ) : null}

        {view.repository?.kind === "ready" && !view.listError && view.reviews.length > 0 ? (
          <div className="h-full overflow-y-auto overscroll-contain py-1">
            {visibleReviews.map((review) => (
              <ReviewRow
                key={review.number}
                review={review}
                repository={repository!}
                canChat={!!sessions()}
                onOpen={openUrl}
                onSelect={selectReview}
                onChat={reviewInChat}
              />
            ))}
            {visibleReviews.length === 0 ? <SectionNotice title="No matching reviews" body="Try a title, review number or author." /> : null}
            {view.truncated ? (
              <p className="px-3 py-2 text-xs leading-5 text-muted-foreground">
                {queryText ? "Searching" : "Showing"} the first {view.reviews.length} open{" "}
                {view.repository.repository.reviewNoun}s. Open {view.repository.repository.providerLabel}{" "}
                in the browser for the full list.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <AlertDialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
        <AlertDialogContent className="max-h-[85vh] grid-cols-[minmax(0,1fr)] overflow-y-auto">
          <AlertDialogHeader className="min-w-0">
            <AlertDialogTitle>Install {repository?.providerLabel} CLI?</AlertDialogTitle>
            <AlertDialogDescription>
              Termco will open a terminal {setupLocation} and run the package-manager command below.
              Review it before continuing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {installCommand ? (
            <code className="block overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground">
              {installCommand}
            </code>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (installCommand) void startSetup(installCommand);
              }}
            >
              Open terminal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
