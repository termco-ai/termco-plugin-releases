import {
  parseSessionEvent,
  parseSessionHeader,
  validateSessionHistory,
  type ParsedSessionEvent,
  type SessionHeader,
} from "@termco/session-base";

export type FixtureReplacementKind = "credential" | "absolute-path";

export interface FixtureSanitizationReview {
  readonly replacements: readonly {
    readonly path: string;
    readonly kind: FixtureReplacementKind;
  }[];
}

export interface ReplayFixtureVerificationOptions {
  readonly expectedRequestCount?: number;
  readonly expectedApprovalCount?: number;
  readonly requiredModelIds?: readonly string[];
  readonly requiredToolNames?: readonly string[];
}

export interface ReplayFixtureVerificationReport {
  readonly sessionId: string;
  readonly eventCount: number;
  readonly requestCount: number;
  readonly approvalCount: number;
  readonly modelIds: readonly string[];
  readonly toolNames: readonly string[];
}

type ParsedFixture = {
  readonly header: SessionHeader;
  readonly events: readonly ParsedSessionEvent[];
};

const credentialPatterns = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
] as const;
const absolutePathPatterns = [
  /\/Users\/[^\s"'\\]+/g,
  /\/home\/[^\s"'\\]+/g,
  /[A-Za-z]:\\Users\\[^\s"']+/g,
] as const;
const credentialKey = /^(?:api[-_]?key|authorization|password|secret|access[-_]?token|refresh[-_]?token|credential)$/i;

function workflowError(message: string): Error & { readonly code: string } {
  return Object.assign(new Error(message), {
    name: "ReplayFixtureWorkflowError",
    code: "INVALID_REPLAY_FIXTURE",
  });
}

function parseFixture(sessionJsonl: string): ParsedFixture {
  const lines = sessionJsonl.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw workflowError("fixture must contain a current header and events");
  let records: unknown[];
  try {
    records = lines.map((line) => JSON.parse(line));
  } catch (cause) {
    throw workflowError(`fixture is not valid JSONL: ${String(cause)}`);
  }
  const header = parseSessionHeader(records[0]);
  const events = records.slice(1).map((record) => parseSessionEvent(record));
  validateSessionHistory(events);
  return { header, events };
}

function pointer(parent: string, key: string | number): string {
  const escaped = String(key).replaceAll("~", "~0").replaceAll("/", "~1");
  return `${parent}/${escaped}`;
}

function replaceString(
  input: string,
  path: string,
  replacements: Array<{ path: string; kind: FixtureReplacementKind }>,
): string {
  let value = input;
  for (const pattern of credentialPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) {
      replacements.push({ path, kind: "credential" });
      pattern.lastIndex = 0;
      value = value.replace(pattern, "{{CREDENTIAL}}");
    }
  }
  for (const pattern of absolutePathPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) {
      replacements.push({ path, kind: "absolute-path" });
      pattern.lastIndex = 0;
      value = value.replace(pattern, "{{WORKSPACE}}");
    }
  }
  return value;
}

function sanitizeValue(
  input: unknown,
  path: string,
  replacements: Array<{ path: string; kind: FixtureReplacementKind }>,
): unknown {
  if (typeof input === "string") return replaceString(input, path, replacements);
  if (Array.isArray(input)) {
    return input.map((value, index) =>
      sanitizeValue(value, pointer(path, index), replacements)
    );
  }
  if (!input || typeof input !== "object") return input;
  return Object.fromEntries(Object.entries(input).map(([key, value]) => {
    const childPath = pointer(path, key);
    if (credentialKey.test(key) && value !== null && value !== "") {
      replacements.push({ path: childPath, kind: "credential" });
      return [key, "{{CREDENTIAL}}"];
    }
    return [key, sanitizeValue(value, childPath, replacements)];
  }));
}

function serializeFixture(input: ParsedFixture): string {
  return [input.header, ...input.events]
    .map((record) => JSON.stringify(record))
    .join("\n");
}

function hasPattern(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

function assertNoSensitiveValues(value: unknown, path = ""): void {
  if (typeof value === "string") {
    if (hasPattern(value, credentialPatterns)) {
      throw workflowError(`fixture contains an unsanitized credential at ${path || "/"}`);
    }
    if (hasPattern(value, absolutePathPatterns)) {
      throw workflowError(`fixture contains an unsanitized absolute path at ${path || "/"}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveValues(item, pointer(path, index)));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = pointer(path, key);
    if (
      credentialKey.test(key) &&
      child !== null &&
      child !== "" &&
      child !== "{{CREDENTIAL}}"
    ) {
      throw workflowError(`fixture contains an unsanitized credential field at ${childPath}`);
    }
    assertNoSensitiveValues(child, childPath);
  }
}

export function sanitizeReplayFixture(sessionJsonl: string): {
  readonly sessionJsonl: string;
  readonly review: FixtureSanitizationReview;
} {
  const parsed = parseFixture(sessionJsonl);
  const replacements: Array<{ path: string; kind: FixtureReplacementKind }> = [];
  const sanitized = sanitizeValue(
    { header: parsed.header, events: parsed.events },
    "",
    replacements,
  ) as { header: SessionHeader; events: ParsedSessionEvent[] };
  const result = serializeFixture(sanitized);
  verifyReplayFixture(result);
  return {
    sessionJsonl: result,
    review: { replacements },
  };
}

export function verifyReplayFixture(
  sessionJsonl: string,
  options: ReplayFixtureVerificationOptions = {},
): ReplayFixtureVerificationReport {
  const parsed = parseFixture(sessionJsonl);
  assertNoSensitiveValues(parsed.header, "/header");
  assertNoSensitiveValues(parsed.events, "/events");
  const serialized = serializeFixture(parsed);
  for (const sentinel of ["UNKNOWN_TOOL", "missing services:", "fallback model"]) {
    if (serialized.toLowerCase().includes(sentinel.toLowerCase())) {
      throw workflowError(`fixture contains forbidden semantic sentinel ${sentinel}`);
    }
  }
  const report = validateSessionHistory(parsed.events);
  if (
    report.openTurn !== undefined ||
    report.openStep !== undefined ||
    report.unresolvedCallIds.length > 0 ||
    report.pendingApprovalIds.length > 0 ||
    report.pendingRetryIds.length > 0 ||
    report.openCompactionIds.length > 0 ||
    report.openSubagentSessionIds.length > 0
  ) {
    throw workflowError("fixture contains an incomplete canonical session tail");
  }
  const requestHeaders = parsed.events.filter(
    (event) => event.type === "request/header",
  );
  const requestCount = requestHeaders.length;
  const approvalCount = parsed.events.filter(
    (event) => event.type === "approval/request",
  ).length;
  const modelIds = [...new Set(requestHeaders.flatMap((event) => {
    const data = event.data as { readonly header?: { readonly selectedModelId?: unknown } };
    return typeof data.header?.selectedModelId === "string"
      ? [data.header.selectedModelId]
      : [];
  }))].sort();
  const toolNames = [...new Set([
    ...requestHeaders.flatMap((event) => {
      const data = event.data as {
        readonly header?: { readonly tools?: readonly { readonly name?: unknown }[] };
      };
      return Array.isArray(data.header?.tools)
        ? data.header.tools.flatMap((tool) =>
            typeof tool.name === "string" ? [tool.name] : []
          )
        : [];
    }),
    ...parsed.events.flatMap((event) => {
      if (event.type !== "tool/call") return [];
      const name = (event.data as { readonly name?: unknown }).name;
      return typeof name === "string" ? [name] : [];
    }),
  ])].sort();
  if (
    options.expectedRequestCount !== undefined &&
    requestCount !== options.expectedRequestCount
  ) {
    throw workflowError(
      `fixture request count ${requestCount} does not match expected ${options.expectedRequestCount}`,
    );
  }
  if (
    options.expectedApprovalCount !== undefined &&
    approvalCount !== options.expectedApprovalCount
  ) {
    throw workflowError(
      `fixture approval count ${approvalCount} does not match expected ${options.expectedApprovalCount}`,
    );
  }
  for (const modelId of options.requiredModelIds ?? []) {
    if (!modelIds.includes(modelId)) {
      throw workflowError(`fixture is missing required model ${modelId}`);
    }
  }
  for (const toolName of options.requiredToolNames ?? []) {
    if (!toolNames.includes(toolName)) {
      throw workflowError(`fixture is missing required tool ${toolName}`);
    }
  }
  return {
    sessionId: parsed.header.id,
    eventCount: parsed.events.length,
    requestCount,
    approvalCount,
    modelIds,
    toolNames,
  };
}
