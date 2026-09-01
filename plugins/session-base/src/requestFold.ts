import type { EffectiveRequestHeader } from "./coreEvents";
import type { ParsedSessionEvent } from "./events";
import { SessionContractError } from "./errors";
import type { RequestId, SessionSeq, StepId, TurnId } from "./identity";
import type { JsonObject, JsonValue } from "./json";
import { assertLosslessJson } from "./validation";

export interface EffectiveRequestContext {
  readonly providerRoute: string;
  readonly providerModelId: string;
  readonly selectedModelId: string;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
  readonly adapterDefaults?: JsonObject;
}

export interface FoldedRequestDescriptor {
  readonly requestId: RequestId;
  readonly turn: TurnId;
  readonly step: StepId;
  readonly headerSeq: SessionSeq;
  readonly contextSeq?: SessionSeq;
  readonly header: EffectiveRequestHeader;
  readonly context?: EffectiveRequestContext;
}

export type EffectiveRequestComparison =
  | { readonly equal: true }
  | {
      readonly equal: false;
      readonly path: string;
      readonly expected: JsonValue | undefined;
      readonly actual: JsonValue | undefined;
      readonly reason: "type" | "value" | "array-length" | "missing-key" | "extra-key";
    };

type UnknownObject = Record<string, unknown>;

function invalidRequest(message: string, path: string, cause?: unknown): never {
  throw new SessionContractError({ code: "INVALID_REQUEST", message, path, cause });
}

function eventData(event: ParsedSessionEvent): UnknownObject {
  return event.data as UnknownObject;
}

/** Selects the latest request header at the boundary and its matching resolved context. */
export function foldRequestHeader(
  events: readonly ParsedSessionEvent[],
  atSeq = Number.POSITIVE_INFINITY,
): FoldedRequestDescriptor {
  if (
    atSeq !== Number.POSITIVE_INFINITY &&
    (!Number.isSafeInteger(atSeq) || atSeq < 0)
  ) {
    invalidRequest("request fold boundary must be a non-negative sequence", "atSeq");
  }

  let headerEvent: ParsedSessionEvent | undefined;
  for (const event of events) {
    if ((event.seq as number) > atSeq) continue;
    if (event.type === "request/header") headerEvent = event;
  }
  if (!headerEvent) {
    invalidRequest(`no request/header exists at or before sequence ${String(atSeq)}`, "events");
  }

  const headerData = eventData(headerEvent);
  const requestId = headerData.requestId as RequestId;
  let contextEvent: ParsedSessionEvent | undefined;
  for (const event of events) {
    const seq = event.seq as number;
    if (seq <= (headerEvent.seq as number) || seq > atSeq || event.type !== "request/context") {
      continue;
    }
    const data = eventData(event);
    if (data.requestId !== requestId) continue;
    if (contextEvent) {
      invalidRequest(
        `request ${requestId} has more than one resolved context`,
        `events[${seq}].data.requestId`,
      );
    }
    contextEvent = event;
  }

  const contextData = contextEvent ? eventData(contextEvent) : undefined;
  const descriptor: FoldedRequestDescriptor = {
    requestId,
    turn: headerData.turn as TurnId,
    step: headerData.step as StepId,
    headerSeq: headerEvent.seq,
    ...(contextEvent === undefined ? {} : { contextSeq: contextEvent.seq }),
    header: headerData.header as unknown as EffectiveRequestHeader,
    ...(contextData === undefined
      ? {}
      : {
          context: {
            providerRoute: contextData.providerRoute as string,
            providerModelId: contextData.providerModelId as string,
            selectedModelId: contextData.selectedModelId as string,
            ...(contextData.contextWindow === undefined
              ? {}
              : { contextWindow: contextData.contextWindow as number }),
            ...(contextData.maxOutputTokens === undefined
              ? {}
              : { maxOutputTokens: contextData.maxOutputTokens as number }),
            ...(contextData.adapterDefaults === undefined
              ? {}
              : { adapterDefaults: contextData.adapterDefaults as JsonObject }),
          },
        }),
  };
  assertRequestDescriptorSafe(descriptor);
  return Object.freeze(descriptor);
}

const forbiddenSecretKeys = new Set([
  "apikey",
  "authorization",
  "authtoken",
  "accesstoken",
  "refreshtoken",
  "password",
  "secret",
  "clientsecret",
  "privatekey",
  "cookie",
  "setcookie",
  "toolapprovalsecret",
  "xapikey",
  "bearertoken",
  "sessiontoken",
  "credential",
  "credentials",
]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function childPath(path: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;
}

/** Rejects credential-bearing fields while allowing schema property names to describe credentials. */
export function assertRequestDescriptorSafe(value: unknown): asserts value is JsonValue {
  assertLosslessJson(value, "$" );

  const visit = (candidate: JsonValue, path: string, insideToolSchema: boolean): void => {
    if (candidate === null || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${path}[${index}]`, insideToolSchema));
      return;
    }
    for (const [key, child] of Object.entries(candidate)) {
      const nextPath = childPath(path, key);
      if (!insideToolSchema && forbiddenSecretKeys.has(normalizedKey(key))) {
        throw new SessionContractError({
          code: "SECRET_IN_REQUEST",
          message: `secret-bearing field ${nextPath} cannot enter the session request descriptor`,
          path: nextPath,
        });
      }
      const nextInsideSchema =
        insideToolSchema ||
        (key === "schema" && /^\$\.header\.tools\[\d+\]$/.test(path));
      visit(child, nextPath, nextInsideSchema);
    }
  };

  visit(value as JsonValue, "$", false);
}

function comparisonPath(path: string, key: string): string {
  return childPath(path, key);
}

function compareValue(expected: JsonValue, actual: JsonValue, path: string): EffectiveRequestComparison {
  if (Object.is(expected, actual)) return { equal: true };
  if (typeof expected !== typeof actual || expected === null || actual === null) {
    return { equal: false, path, expected, actual, reason: "type" };
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return { equal: false, path, expected, actual, reason: "type" };
    }
    if (expected.length !== actual.length) {
      return { equal: false, path, expected, actual, reason: "array-length" };
    }
    for (let index = 0; index < expected.length; index += 1) {
      const result = compareValue(expected[index]!, actual[index]!, `${path}[${index}]`);
      if (!result.equal) return result;
    }
    return { equal: true };
  }
  if (typeof expected === "object" && typeof actual === "object") {
    const expectedObject = expected as JsonObject;
    const actualObject = actual as JsonObject;
    const expectedKeys = Object.keys(expectedObject).sort();
    const actualKeys = Object.keys(actualObject).sort();
    for (const key of expectedKeys) {
      if (!(key in actualObject)) {
        return {
          equal: false,
          path: comparisonPath(path, key),
          expected: expectedObject[key],
          actual: undefined,
          reason: "missing-key",
        };
      }
    }
    for (const key of actualKeys) {
      if (!(key in expectedObject)) {
        return {
          equal: false,
          path: comparisonPath(path, key),
          expected: undefined,
          actual: actualObject[key],
          reason: "extra-key",
        };
      }
    }
    for (const key of expectedKeys) {
      const result = compareValue(
        expectedObject[key]!,
        actualObject[key]!,
        comparisonPath(path, key),
      );
      if (!result.equal) return result;
    }
    return { equal: true };
  }
  return { equal: false, path, expected, actual, reason: "value" };
}

export function compareEffectiveRequests(expected: unknown, actual: unknown): EffectiveRequestComparison {
  assertRequestDescriptorSafe(expected);
  assertRequestDescriptorSafe(actual);
  return compareValue(expected, actual, "$" );
}

export function assertEffectiveRequestMatch(expected: unknown, actual: unknown): void {
  const comparison = compareEffectiveRequests(expected, actual);
  if (comparison.equal) return;
  throw new SessionContractError({
    code: "REQUEST_MISMATCH",
    message: `dispatched semantic request diverges at ${comparison.path} (${comparison.reason})`,
    path: comparison.path,
  });
}

function canonicalize(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const object = value as JsonObject;
  return Object.fromEntries(
    Object.keys(object)
      .sort()
      .map((key) => [key, canonicalize(object[key]!)]),
  ) as JsonObject;
}

export function serializeEffectiveRequest(value: unknown): string {
  assertRequestDescriptorSafe(value);
  return JSON.stringify(canonicalize(value));
}
