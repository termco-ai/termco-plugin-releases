import type {
  AiToolContribution,
  AiToolDefinition,
  AiToolRuntime,
} from "@termco/ai-tools-base";
import {
  SessionId,
  SessionSeq,
  type SessionModelQueryCapability,
} from "@termco/session-base";

const MODEL_QUERY_TIMEOUT_MS = 2_000;
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const unavailable = Object.freeze({ error: "session query is unavailable" });
const missing = Object.freeze({ found: false });

const searchSchema = {
  type: "object",
  properties: {
    text: { type: "string", minLength: 1, maxLength: 1_000 },
  },
  required: ["text"],
  additionalProperties: false,
} as const;

const eventSearchSchema = {
  type: "object",
  properties: {
    text: { type: "string", minLength: 1, maxLength: 1_000 },
    sessionId: { type: "string", minLength: 1, maxLength: 200 },
  },
  required: ["text"],
  additionalProperties: false,
} as const;

const traceSchema = {
  type: "object",
  properties: {
    sessionId: { type: "string", minLength: 1, maxLength: 200 },
  },
  required: ["sessionId"],
  additionalProperties: false,
} as const;

const eventSchema = {
  type: "object",
  properties: {
    sessionId: { type: "string", minLength: 1, maxLength: 200 },
    seq: { type: "integer", minimum: 0 },
  },
  required: ["sessionId", "seq"],
  additionalProperties: false,
} as const;

function objectInput(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
}

function callerId(runtime: AiToolRuntime): SessionId | null {
  const value = runtime.getSessionId?.();
  if (typeof value !== "string" || !SESSION_ID_PATTERN.test(value)) return null;
  try {
    return SessionId(value);
  } catch {
    return null;
  }
}

function sessionIdInput(input: Record<string, unknown>, key = "sessionId"): SessionId | null {
  const value = input[key];
  return typeof value === "string" && SESSION_ID_PATTERN.test(value)
    ? SessionId(value)
    : null;
}

function stringInput(input: Record<string, unknown>, key: string): string {
  return typeof input[key] === "string" ? input[key] : "";
}

function seqInput(input: Record<string, unknown>): SessionSeq | null {
  const value = input.seq;
  if (!Number.isSafeInteger(value) || Number(value) < 0) return null;
  try {
    return SessionSeq(Number(value));
  } catch {
    return null;
  }
}

async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T | typeof unavailable> {
  try {
    return await operation(AbortSignal.timeout(MODEL_QUERY_TIMEOUT_MS));
  } catch {
    return unavailable;
  }
}

export function createSessionQueryContribution(
  query: SessionModelQueryCapability,
): AiToolContribution {
  return {
    id: "session-query",
    group: "session-query",
    order: 160,
    build(runtime) {
      const sessionSearch: AiToolDefinition = {
        description: "Search redacted prior session records in this session's authorized workspace.",
        inputSchema: searchSchema,
        async execute(input) {
          const callerSessionId = callerId(runtime);
          if (callerSessionId === null) return unavailable;
          const text = stringInput(objectInput(input), "text");
          return bounded(async (signal) => {
            const page = await query.search({ callerSessionId, text, signal });
            const seen = new Set<string>();
            return {
              ...page,
              results: page.results.filter((result) => {
                if (seen.has(result.sessionId)) return false;
                seen.add(result.sessionId);
                return true;
              }),
            };
          });
        },
      };
      const eventSearch: AiToolDefinition = {
        description: "Search redacted canonical events in authorized current-format sessions.",
        inputSchema: eventSearchSchema,
        async execute(input) {
          const callerSessionId = callerId(runtime);
          if (callerSessionId === null) return unavailable;
          const value = objectInput(input);
          const text = stringInput(value, "text");
          let targetSessionId: SessionId | undefined;
          if (value.sessionId !== undefined) {
            const sessionId = sessionIdInput(value);
            if (sessionId === null) return missing;
            targetSessionId = sessionId;
          }
          return bounded((signal) => query.search({
            callerSessionId,
            text,
            ...(targetSessionId === undefined ? {} : { targetSessionId }),
            signal,
          }));
        },
      };
      const sessionTrace: AiToolDefinition = {
        description: "Read bounded parent and child lineage for an authorized session.",
        inputSchema: traceSchema,
        async execute(input) {
          const callerSessionId = callerId(runtime);
          if (callerSessionId === null) return unavailable;
          const sessionId = sessionIdInput(objectInput(input));
          if (sessionId === null) return missing;
          return bounded(async (signal) => {
            const result = await query.traceSession({
              callerSessionId,
              sessionId,
              signal,
            });
            return result === null ? missing : { found: true, value: result };
          });
        },
      };
      const eventTrace: AiToolDefinition = {
        description: "Explain the redacted canonical source and derived edges of one authorized event.",
        inputSchema: eventSchema,
        async execute(input) {
          const callerSessionId = callerId(runtime);
          if (callerSessionId === null) return unavailable;
          const value = objectInput(input);
          const seq = seqInput(value);
          const sessionId = sessionIdInput(value);
          if (seq === null || sessionId === null) return missing;
          return bounded(async (signal) => {
            const result = await query.explainEvent({
              callerSessionId,
              sessionId,
              seq,
              signal,
            });
            return result === null ? missing : { found: true, value: result };
          });
        },
      };
      const eventRead: AiToolDefinition = {
        description: "Read one redacted canonical current-format event from an authorized session.",
        inputSchema: eventSchema,
        async execute(input) {
          const callerSessionId = callerId(runtime);
          if (callerSessionId === null) return unavailable;
          const value = objectInput(input);
          const seq = seqInput(value);
          const sessionId = sessionIdInput(value);
          if (seq === null || sessionId === null) return missing;
          return bounded(async (signal) => {
            const result = await query.readEvent({
              callerSessionId,
              sessionId,
              seq,
              signal,
            });
            return result === null ? missing : { found: true, value: result };
          });
        },
      };
      return {
        session_search: sessionSearch,
        session_event_search: eventSearch,
        session_trace: sessionTrace,
        session_event_trace: eventTrace,
        session_event_read: eventRead,
      };
    },
  };
}
