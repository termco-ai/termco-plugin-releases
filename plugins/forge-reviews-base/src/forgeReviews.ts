import type { WorkspaceEnv } from "@termco/workspace-base";

export type ForgeProviderId = "github" | "gitlab" | "gitea";

export interface ForgeProviderFeatures {
  approve: boolean;
  requestChanges: boolean;
  inlineComments: boolean;
  resolveThreads: boolean;
  /** The provider can submit several comments as one review transaction. */
  reviewSubmission?: boolean;
}

export interface ForgeRepository {
  provider: ForgeProviderId;
  providerLabel: string;
  cli: "gh" | "glab" | "tea";
  host: string;
  slug: string;
  repoRoot: string;
  /** Credential-free repository URL; authentication belongs to the CLI. */
  remoteUrl: string;
  remoteName: string;
  reviewNoun: "pull request" | "merge request";
  features: ForgeProviderFeatures;
}

export interface ForgeInstallSetup {
  command: string | null;
  documentationUrl: string;
}

export type ForgeRepositoryState =
  | { kind: "unsupported"; host: string | null; message: string }
  | {
      kind: "cli-missing";
      repository: ForgeRepository;
      install: ForgeInstallSetup;
      loginCommand: string;
    }
  | {
      kind: "not-authenticated";
      repository: ForgeRepository;
      loginCommand: string;
    }
  | { kind: "ready"; repository: ForgeRepository }
  | {
      kind: "error";
      repository: ForgeRepository | null;
      message: string;
    };

export interface ForgeReviewAuthor {
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface ForgeReviewSummary {
  number: number;
  title: string;
  author: ForgeReviewAuthor;
  draft: boolean;
  updatedAt: string | null;
  url: string;
  headSha: string | null;
  reviewStatus: string | null;
}

export interface ForgeReviewList {
  reviews: ForgeReviewSummary[];
  truncated: boolean;
}

export interface ForgeRepositoryRequest {
  repoRoot: string;
  workspace: WorkspaceEnv;
  refresh?: boolean;
}

export interface ForgeReviewListRequest {
  repository: ForgeRepository;
  workspace: WorkspaceEnv;
  refresh?: boolean;
}

export interface ForgeReviewCheck {
  name: string;
  state: string;
  detailsUrl: string | null;
}

export interface ForgeReviewDiscussion {
  /** Provider comment/note identity, when exposed by the CLI response. */
  id: string | null;
  /** Provider thread identity used to group replies in the review surface. */
  threadId: string | null;
  /** Provider-safe target for a reply, or null when threaded replies are unsupported. */
  replyToId: string | null;
  kind: "comment" | "review" | "system";
  state: string | null;
  author: string;
  body: string;
  createdAt: string | null;
  resolved: boolean | null;
  /** Whether this conversation is eligible for resolve/reopen operations. */
  resolvable?: boolean;
  /** The diff position belongs to an older revision and may no longer render inline. */
  outdated?: boolean;
  path: string | null;
  line: number | null;
  /** Diff side when the provider exposes it. */
  side?: "old" | "new" | null;
}

export interface ForgeReviewParticipant {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  state: "requested" | "commented" | "approved" | "changes_requested" | "unknown";
}

export interface ForgeReviewReadiness {
  mergeable: boolean | null;
  hasConflicts: boolean | null;
  blockingConversationsResolved: boolean | null;
  approvalsRequired: number | null;
  approvalsRemaining: number | null;
  approvedBy: string[];
  reviewers: ForgeReviewParticipant[];
  /** Human-readable blockers calculated from authoritative provider fields. */
  blockers: string[];
}

export type ForgeReviewFileStatus = "added" | "modified" | "deleted" | "renamed" | "binary";

export interface ForgeReviewFile {
  path: string;
  previousPath: string | null;
  status: ForgeReviewFileStatus;
  additions: number;
  deletions: number;
  patch: string;
}

export interface ForgeReviewInspection {
  summary: ForgeReviewSummary;
  body: string;
  baseRef: string | null;
  headRef: string | null;
  baseSha: string | null;
  /** GitLab diff start SHA when available. */
  startSha?: string | null;
  sourceRepository: string | null;
  targetRepository: string;
  additions: number;
  deletions: number;
  mergeStatus: string | null;
  commits: number;
  checks: ForgeReviewCheck[];
  discussions: ForgeReviewDiscussion[];
  readiness?: ForgeReviewReadiness;
  files: ForgeReviewFile[];
}

export type ForgeReviewOutcome = "comment" | "approve" | "request_changes";

export interface ForgeReviewInspectRequest {
  repository: ForgeRepository;
  workspace: WorkspaceEnv;
  number: number;
  refresh?: boolean;
}

export interface ForgeReviewCommentDraft {
  body: string;
  path: string | null;
  line: number | null;
  side: "new" | "old" | null;
  /** When present, publish this draft as a reply to an existing provider thread. */
  replyToId?: string | null;
  /** Display-only context retained while the reply remains a local draft. */
  replyToAuthor?: string | null;
}

export interface ForgeReviewPublishRequest {
  repository: ForgeRepository;
  workspace: WorkspaceEnv;
  number: number;
  /** Publishing is refused when the hosted review moved since it was read. */
  expectedHeadSha: string;
  comments: ForgeReviewCommentDraft[];
}

export interface ForgeReviewPublishResult {
  published: number;
  headSha: string;
  remaining: ForgeReviewCommentDraft[];
  error: string | null;
}

export interface ForgeReviewSubmitRequest extends ForgeReviewPublishRequest {
  outcome: ForgeReviewOutcome;
  summary: string;
}

export interface ForgeReviewSubmitResult extends ForgeReviewPublishResult {
  /** These receipts are independent of how many comments succeeded. */
  outcomeSubmitted: boolean;
  summarySubmitted: boolean;
  outcome: ForgeReviewOutcome;
}

export interface ForgeReviewResolveThreadRequest {
  repository: ForgeRepository;
  workspace: WorkspaceEnv;
  number: number;
  threadId: string;
  resolved: boolean;
}

export interface ForgeReviewWorktreeRequest {
  repository: ForgeRepository;
  workspace: WorkspaceEnv;
  number: number;
  expectedHeadSha: string;
}

export interface ForgeReviewWorktreeResult {
  path: string;
  reused: boolean;
  headSha: string;
}

/** Read-only hosted-review capability. Provider authentication is owned by the
 * installed CLI; Termco never reads or persists its tokens. */
export interface ForgeReviewsCapability {
  repository(request: ForgeRepositoryRequest): Promise<ForgeRepositoryState>;
  listOpen(request: ForgeReviewListRequest): Promise<ForgeReviewList>;
  /** Load one review and its provider-normalized unified diff. All returned
   * hosted text is untrusted content and never includes CLI credentials. */
  inspect(request: ForgeReviewInspectRequest): Promise<ForgeReviewInspection>;
  /** Publish user-confirmed comments after revalidating the exact review head. */
  publishComments(request: ForgeReviewPublishRequest): Promise<ForgeReviewPublishResult>;
  /** Submit pending comments with a provider review outcome when supported. */
  submitReview?(request: ForgeReviewSubmitRequest): Promise<ForgeReviewSubmitResult>;
  /** Resolve or reopen one provider conversation. */
  setThreadResolved?(request: ForgeReviewResolveThreadRequest): Promise<void>;
  /** Prepare a detached exact-head worktree without switching the user's
   * active checkout. */
  prepareWorktree(request: ForgeReviewWorktreeRequest): Promise<ForgeReviewWorktreeResult>;
}
