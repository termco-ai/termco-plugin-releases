export interface BootDiagnostic {
  requestedProfileId: string;
  recoveryProfileId: string;
  phase: "profile-boot";
  message: string;
  at: string;
}

/** Application-wide durable record of the profile failure that selected the
 * protected recovery profile. */
export interface BootDiagnosticsCapability {
  read(): Promise<BootDiagnostic | null>;
  record(diagnostic: BootDiagnostic): Promise<void>;
  clear(): Promise<void>;
}
