export type SessionContractErrorCode =
  | "INVALID_HEADER"
  | "INVALID_EVENT"
  | "INVALID_SURFACE"
  | "INVALID_REQUEST"
  | "REQUEST_MISMATCH"
  | "SECRET_IN_REQUEST"
  | "INVALID_PROJECTION"
  | "INVALID_JSON"
  | "UNKNOWN_REQUIRED_EVENT"
  | "INVARIANT_VIOLATION"
  | "FORMAT_UNSUPPORTED";

export interface SessionContractErrorInput {
  readonly code: SessionContractErrorCode;
  readonly message: string;
  readonly path?: string;
  readonly cause?: unknown;
}

/** Structured failure raised at the public session contract seam. */
export class SessionContractError extends Error {
  readonly code: SessionContractErrorCode;
  readonly path?: string;

  constructor(input: SessionContractErrorInput) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause });
    this.name = "SessionContractError";
    this.code = input.code;
    this.path = input.path;
  }
}
