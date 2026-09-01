/**
 * One token count for both message shapes.
 *
 * There used to be two estimators — `approxBytes` for `ModelMessage[]` in the
 * compaction ladder, `estimateTokens` for `UIMessage[]` in the context meter —
 * and they disagreed: one ignored images, the other ignored reasoning, and both
 * ignored the system prompt. The meter and the thing it was supposed to predict
 * were measuring different conversations.
 *
 * They share their arithmetic now. `count.test.ts` asserts that an equivalent
 * conversation costs the same in both shapes; that test is the point of this
 * file.
 */

import type { UIMessage } from "@ai-sdk/react";
import type { ModelMessage } from "ai";
import { calibrationFactor } from "./calibration";
import { countText } from "./encoder";
import {
  documentTokens,
  imageTokens,
  isImageMedia,
  type MediaCostModel,
  mediaCostModel,
} from "./media";

/** Per-message framing (role, delimiters) the provider adds. */
const PER_MESSAGE_TOKENS = 4;
/** Per-tool-call framing on top of the serialised arguments. */
const PER_TOOL_CALL_TOKENS = 8;

export type CountOptions = {
  /** Selects the media cost model and the calibration bucket. */
  modelId?: string;
  /** Skip the real encoder — for UI paths that run on every keystroke. */
  fast?: boolean;
};

type Ctx = { media: MediaCostModel; text: (s: string) => number };

function ctxFor(o: CountOptions | undefined): Ctx {
  const media = mediaCostModel(o?.modelId);
  const text = o?.fast ? (s: string) => Math.ceil(s.length / 3.0) : countText;
  return { media, text };
}

function jsonTokens(v: unknown, ctx: Ctx): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "string") return ctx.text(v);
  try {
    return ctx.text(JSON.stringify(v) ?? "");
  } catch {
    return 0;
  }
}

/**
 * Cost of one tool result / output value.
 *
 * Images hide in here: a browser screenshot arrives as
 * `{type:"content", value:[{type:"image-data", data, mediaType}]}`, and
 * `JSON.stringify` on that is megabytes of base64 that must NOT be counted as
 * text — it is counted as an image, at image prices.
 */
function outputTokens(output: unknown, ctx: Ctx): number {
  if (output === undefined || output === null) return 0;
  if (typeof output === "string") return ctx.text(output);
  if (typeof output !== "object") return jsonTokens(output, ctx);

  const o = output as { type?: unknown; value?: unknown };
  if (o.type === "content" && Array.isArray(o.value)) {
    let n = 0;
    for (const item of o.value) {
      n += contentItemTokens(item, ctx);
    }
    return n;
  }
  if (o.type === "text" && typeof o.value === "string") return ctx.text(o.value);
  return jsonTokens(output, ctx);
}

function contentItemTokens(item: unknown, ctx: Ctx): number {
  if (!item || typeof item !== "object") return jsonTokens(item, ctx);
  const it = item as {
    type?: string;
    text?: unknown;
    data?: unknown;
    mediaType?: string;
  };
  if (it.type === "text" && typeof it.text === "string") return ctx.text(it.text);
  if (
    it.type === "media" ||
    it.type === "image" ||
    it.type === "image-data" ||
    isImageMedia(it.mediaType)
  ) {
    const data = typeof it.data === "string" ? it.data : undefined;
    return isImageMedia(it.mediaType) || it.type !== "media"
      ? imageTokens({ mediaType: it.mediaType, data }, ctx.media)
      : documentTokens({ mediaType: it.mediaType, data }, ctx.text);
  }
  return jsonTokens(item, ctx);
}

/** Cost of a single `ModelMessage`. */
export function countModelMessage(m: ModelMessage, o?: CountOptions): number {
  const ctx = ctxFor(o);
  let n = PER_MESSAGE_TOKENS;
  if (typeof m.content === "string") return n + ctx.text(m.content);
  if (!Array.isArray(m.content)) return n;

  for (const raw of m.content) {
    const part = raw as {
      type?: string;
      text?: unknown;
      input?: unknown;
      output?: unknown;
      data?: unknown;
      image?: unknown;
      mediaType?: string;
    };
    switch (part.type) {
      case "text":
      case "reasoning":
        if (typeof part.text === "string") n += ctx.text(part.text);
        break;
      case "tool-call":
        n += PER_TOOL_CALL_TOKENS + jsonTokens(part.input, ctx);
        break;
      case "tool-result":
        n += outputTokens(part.output, ctx);
        break;
      case "image":
        n += imageTokens(
          {
            mediaType: part.mediaType,
            data:
              typeof part.image === "string"
                ? part.image
                : typeof part.data === "string"
                  ? part.data
                  : undefined,
          },
          ctx.media,
        );
        break;
      case "file":
        n += isImageMedia(part.mediaType)
          ? imageTokens(
              {
                mediaType: part.mediaType,
                data: typeof part.data === "string" ? part.data : undefined,
              },
              ctx.media,
            )
          : documentTokens(
              {
                mediaType: part.mediaType,
                data: typeof part.data === "string" ? part.data : undefined,
              },
              ctx.text,
            );
        break;
      default:
        n += jsonTokens(part, ctx);
    }
  }
  return n;
}

/**
 * Uncalibrated total.
 *
 * This is what `recordUsage` must be fed. Handing it the calibrated number
 * instead would have the factor correcting its own output — a feedback loop
 * that converges on the wrong value and drifts every time the ratio moves.
 */
export function countModelMessagesRaw(
  messages: readonly ModelMessage[],
  o?: CountOptions,
): number {
  let n = 0;
  for (const m of messages) n += countModelMessage(m, o);
  return n;
}

export function countModelMessages(
  messages: readonly ModelMessage[],
  o?: CountOptions,
): number {
  return Math.round(
    countModelMessagesRaw(messages, o) * calibrationFactor(o?.modelId),
  );
}

/** Cost of a single `UIMessage`. */
function countUIMessage(m: UIMessage, o?: CountOptions): number {
  const ctx = ctxFor(o);
  let n = PER_MESSAGE_TOKENS;
  for (const raw of m.parts ?? []) {
    const part = raw as {
      type?: string;
      text?: unknown;
      input?: unknown;
      output?: unknown;
      url?: unknown;
      mediaType?: string;
    };
    const type = part.type ?? "";
    if (type === "text" || type === "reasoning") {
      if (typeof part.text === "string") n += ctx.text(part.text);
    } else if (type === "file") {
      const data = typeof part.url === "string" ? part.url : undefined;
      n += isImageMedia(part.mediaType)
        ? imageTokens({ mediaType: part.mediaType, data }, ctx.media)
        : documentTokens({ mediaType: part.mediaType, data }, ctx.text);
    } else if (type.startsWith("tool-") || type === "dynamic-tool") {
      if (part.input !== undefined)
        n += PER_TOOL_CALL_TOKENS + jsonTokens(part.input, ctx);
      if (part.output !== undefined) n += outputTokens(part.output, ctx);
    } else if (type === "step-start") {
      // Structural marker; carries no payload.
    } else {
      n += jsonTokens(part, ctx);
    }
  }
  return n;
}

export function countUIMessages(
  messages: readonly UIMessage[],
  o?: CountOptions,
): number {
  let n = 0;
  for (const m of messages) n += countUIMessage(m, o);
  return Math.round(n * calibrationFactor(o?.modelId));
}
