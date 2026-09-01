export interface UpdateMetadata {
  available: boolean;
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
}

export interface ApplicationUpdatesCapability {
  check(): Promise<UpdateMetadata | null>;
  downloadAndInstall(): Promise<void>;
  install(): void;
}

export interface PluginReleaseUpdateItem {
  id: string;
  name: string;
  version: string;
  currentVersion: string | null;
  notes: string;
}

export interface PluginReleaseUpdate {
  releaseId: string;
  publishedAt: string;
  plugins: PluginReleaseUpdateItem[];
  skipped?: Array<PluginReleaseUpdateItem & { reason: string }>;
}

export type PluginUpdateProgressStage =
  | "downloading"
  | "verifying"
  | "preparing"
  | "activating";

export interface PluginUpdateProgress {
  stage: PluginUpdateProgressStage;
  completed: number;
  total: number;
  downloadedBytes?: number;
  totalBytes?: number;
  pluginName?: string;
}

export type PluginReleaseCheckResult =
  | { kind: "unconfigured" }
  | { kind: "up-to-date" }
  | {
      kind: "incompatible";
      releaseId: string;
      minApplicationVersion: string;
      maxApplicationVersionExclusive?: string;
    }
  | { kind: "blocked"; release: PluginReleaseUpdate; reason: string }
  | { kind: "available"; release: PluginReleaseUpdate }
  | { kind: "rolled-back"; releaseId: string; reason: string };

export type PluginReleaseInstallResult =
  | { status: "installed"; release: PluginReleaseUpdate }
  | { status: "cancelled"; release: PluginReleaseUpdate };

export interface PluginReleaseUpdatesCapability {
  check(): Promise<PluginReleaseCheckResult>;
  install(releaseId: string): Promise<PluginReleaseInstallResult>;
}

export interface ManualUpdateInfo {
  version: string;
  currentVersion: string;
  body: string;
  releaseUrl: string;
}

export type ApplicationUpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "uptodate" }
  | { kind: "available"; update: UpdateMetadata }
  | { kind: "manual-available"; info: ManualUpdateInfo }
  | { kind: "downloading"; downloaded: number; contentLength: number | null }
  | { kind: "ready" }
  | { kind: "plugin-available"; release: PluginReleaseUpdate }
  | {
      kind: "plugin-installing";
      release: PluginReleaseUpdate;
      progress?: PluginUpdateProgress;
    }
  | { kind: "plugin-installed"; release: PluginReleaseUpdate }
  | { kind: "plugin-blocked"; release: PluginReleaseUpdate; reason: string }
  | { kind: "plugin-rolled-back"; releaseId: string; reason: string }
  | { kind: "error"; message: string };

/** Renderer-side workflow state selected with the updater implementation.
 * Every update surface observes this one store, so About, dialogs, and future
 * status-bar affordances cannot disagree about progress or availability. */
export interface ApplicationUpdateStateCapability {
  snapshot(): ApplicationUpdateStatus;
  subscribe(listener: () => void): () => void;
  check(options?: { manual?: boolean }): Promise<void>;
  install(): Promise<void>;
  dismiss(): void;
}
