declare const sessionIdentityBrand: unique symbol;

type SessionIdentity<TName extends string, TValue extends string | number> =
  TValue & { readonly [sessionIdentityBrand]: TName };

export type SessionId = SessionIdentity<"SessionId", string>;
export type SessionSeq = SessionIdentity<"SessionSeq", number>;
export type SessionRevision = SessionIdentity<"SessionRevision", number>;
export type TurnId = SessionIdentity<"TurnId", number>;
export type StepId = SessionIdentity<"StepId", number>;
export type RequestId = SessionIdentity<"RequestId", string>;
export type MessageId = SessionIdentity<"MessageId", string>;
export type ToolCallId = SessionIdentity<"ToolCallId", string>;
export type ApprovalId = SessionIdentity<"ApprovalId", string>;
export type RetryId = SessionIdentity<"RetryId", string>;
export type CompactionId = SessionIdentity<"CompactionId", string>;

/** Brand an already-validated opaque session id. Runtime validation belongs to the session contract validator. */
export function SessionId(value: string): SessionId {
  return value as SessionId;
}

/** Brand an already-validated session-local sequence number. The session store is its only live allocator. */
export function SessionSeq(value: number): SessionSeq {
  return value as SessionSeq;
}

export function SessionRevision(value: number): SessionRevision {
  return value as SessionRevision;
}

export function TurnId(value: number): TurnId {
  return value as TurnId;
}

export function StepId(value: number): StepId {
  return value as StepId;
}

export function RequestId(value: string): RequestId {
  return value as RequestId;
}

export function MessageId(value: string): MessageId {
  return value as MessageId;
}

export function ToolCallId(value: string): ToolCallId {
  return value as ToolCallId;
}

export function ApprovalId(value: string): ApprovalId {
  return value as ApprovalId;
}

export function RetryId(value: string): RetryId {
  return value as RetryId;
}

export function CompactionId(value: string): CompactionId {
  return value as CompactionId;
}
