import type { SessionId, SessionSeq } from "@termco/session-base";

export const TRAJECTORY_NAVIGATION_SERVICE = "trajectory.navigation" as const;

export interface TrajectoryLocation {
  readonly eventSeq?: SessionSeq;
  readonly recordId?: string;
}

/** Presentation-only navigation. History mutation and fork/rerun belong to their owning modules. */
export interface TrajectoryNavigationCapability {
  openSession(sessionId: SessionId, location?: TrajectoryLocation): void;
  openSearch(): void;
  openSessionList(): void;
}

declare module "@termco/kernel" {
  interface Services {
    [TRAJECTORY_NAVIGATION_SERVICE]: TrajectoryNavigationCapability;
  }
}
