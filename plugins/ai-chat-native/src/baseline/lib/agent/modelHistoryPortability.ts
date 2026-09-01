/**
 * Cross-model history portability.
 *
 * When the user switches the active model mid-conversation, the whole persisted
 * transcript — authored while a *different* model was active — is replayed to
 * the new model. That transcript carries model/provider-scoped data that the new
 * model rejects:
 *  - reasoning parts + their provider metadata (OpenAI Responses reasoning-item
 *    ids / encrypted content, Anthropic thinking-block signatures) are scoped to
 *    the model that produced them; replaying them elsewhere is a hard 400.
 *  - images can't go to a model with no vision.
 *
 * `sanitizeHistoryForModel` transforms the history into a portable form the
 * target model accepts. Each assistant message is tagged (during streaming) with
 * the model that produced it (`metadata.modelId`); a message is "foreign" when
 * that tag differs from the target model. Messages without an author-model tag
 * are treated as foreign because provider-scoped data cannot be proven safe.
 * Foreign messages keep their portable content
 * (text, tool calls/results) but lose provider metadata and reasoning.
 *
 * This is a no-op in the common case: within a single-model chat every message
 * was authored by the current model, so nothing is stripped.
 */

import type { UIMessage } from "ai";
import type { AiModelDefinition as ModelInfo } from "@termco/ai-models-base";

/** Message-level metadata we attach to persisted messages. */
export type ChatMessageMetadata = { modelId?: string };

const VISION_STUB = "[image omitted — the selected model has no vision]";

/** Provider-metadata keys carried on UI message parts, scoped to the producing model. */
const PROVIDER_META_KEYS = [
  "providerMetadata",
  "callProviderMetadata",
] as const;

type AnyPart = { type: string } & Record<string, unknown>;

/** True for a `file` part whose media is an image (`image/png` or bare `image`). */
function isImagePart(part: AnyPart): boolean {
  if (part.type !== "file") return false;
  const mt = part.mediaType;
  return typeof mt === "string" && (mt === "image" || mt.startsWith("image/"));
}

/** Drop provider-scoped metadata keys from a part (returns a new object if changed). */
function stripProviderMeta(part: AnyPart): AnyPart {
  let changed = false;
  const out: AnyPart = { ...part };
  for (const key of PROVIDER_META_KEYS) {
    if (key in out) {
      delete out[key];
      changed = true;
    }
  }
  return changed ? out : part;
}

/** The author model recorded by the current message contract. */
function authorModelId(message: UIMessage): string | undefined {
  return (message.metadata as ChatMessageMetadata | undefined)?.modelId;
}

/**
 * Transform persisted UI history into a form the target model accepts.
 * Pure — never mutates the input.
 */
export function sanitizeHistoryForModel(
  messages: UIMessage[],
  targetModelId: string,
  targetInfo: Pick<ModelInfo, "tags">,
): UIMessage[] {
  const targetHasVision = targetInfo.tags?.includes("vision") ?? false;

  let anyChanged = false;
  const out = messages.map((message): UIMessage => {
    const foreign = authorModelId(message) !== targetModelId;
    let partsChanged = false;

    const nextParts: AnyPart[] = [];
    for (const raw of message.parts as unknown as AnyPart[]) {
      let part = raw;

      // The target can't render images — replace image file parts with a stub.
      if (!targetHasVision && isImagePart(part)) {
        nextParts.push({ type: "text", text: VISION_STUB });
        partsChanged = true;
        continue;
      }

      if (foreign) {
        // Foreign reasoning is bound to another model's response; drop it.
        if (part.type === "reasoning" || part.type === "reasoning-file") {
          partsChanged = true;
          continue;
        }
        // Strip provider-scoped metadata so nothing model-specific is replayed.
        const stripped = stripProviderMeta(part);
        if (stripped !== part) {
          part = stripped;
          partsChanged = true;
        }
      }

      nextParts.push(part);
    }

    if (!partsChanged) return message;
    anyChanged = true;
    return { ...message, parts: nextParts as UIMessage["parts"] };
  });

  return anyChanged ? out : messages;
}
