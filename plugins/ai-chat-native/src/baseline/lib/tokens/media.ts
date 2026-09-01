/**
 * What non-text content actually costs.
 *
 * The bug this file exists to kill: the old estimator charged every non-text
 * part a flat 64 CHARACTERS — so two full-page screenshots, three megabytes of
 * base64, were booked as 32 tokens. The clamp then reported "fits", and the
 * provider answered 400. The UI estimator was worse: it ignored image parts
 * entirely.
 *
 * Real numbers instead, per provider, because they differ by an order of
 * magnitude:
 *
 * - **Anthropic**: `(w × h) / 750`, after downscaling to ~1.15 MP — so ~1600 is
 *   the practical ceiling for one image.
 * - **OpenAI** (detail: high): fit into 2048², scale the short side to 768,
 *   then `85 + 170 × ceil(w/512) × ceil(h/512)`.
 * - **Google**: 258 tokens per 384×384 tile.
 *
 * Dimensions are sniffed from the first few KB of the payload. When that fails
 * — unknown format, truncated data — the constant is deliberately generous:
 * over-counting an image costs one early compaction, under-counting costs a
 * rejected request.
 */

export type MediaCostModel = "anthropic" | "openai" | "google" | "generic";

/** When we cannot measure an image, assume a big one. */
export const DEFAULT_IMAGE_TOKENS = 1600;
/** CC charges 2000 per document block; matching that. */
const DEFAULT_DOCUMENT_TOKENS = 2000;

export function mediaCostModel(modelId?: string): MediaCostModel {
  const id = (modelId ?? "").toLowerCase();
  if (id.includes("claude") || id.includes("anthropic")) return "anthropic";
  if (id.includes("gemini") || id.includes("google")) return "google";
  if (id.includes("gpt") || id.includes("openai") || id.startsWith("o1") || id.startsWith("o3"))
    return "openai";
  return "generic";
}

type ImageSize = { width: number; height: number };

/** Decode enough of a base64 payload to read an image header. */
function headerBytes(data: string, max = 8192): Uint8Array | null {
  try {
    const comma = data.indexOf(",");
    const b64 = data.startsWith("data:") && comma !== -1 ? data.slice(comma + 1) : data;
    // 4 base64 chars -> 3 bytes; round down to a whole group.
    const need = Math.min(b64.length, Math.ceil((max * 4) / 3) & ~3);
    const bin = atob(b64.slice(0, need));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

const be32 = (b: Uint8Array, i: number) =>
  (b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
const be16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);

/** Read `width`/`height` out of PNG / GIF / WebP / JPEG headers. */
function imageDimensions(data?: string): ImageSize | null {
  if (!data) return null;
  const b = headerBytes(data);
  if (!b || b.length < 16) return null;

  // PNG: 8-byte signature, then IHDR with width/height at 16..24.
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const w = be32(b, 16) >>> 0;
    const h = be32(b, 20) >>> 0;
    return w && h ? { width: w, height: h } : null;
  }

  // GIF: little-endian dimensions at 6..10.
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    const w = le16(b, 6);
    const h = le16(b, 8);
    return w && h ? { width: w, height: h } : null;
  }

  // WebP: "RIFF"…"WEBP" then a VP8/VP8L/VP8X chunk.
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (tag === "VP8X" && b.length >= 30) {
      const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
      const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
      return { width: w, height: h };
    }
    if (tag === "VP8 " && b.length >= 30) {
      const w = le16(b, 26) & 0x3fff;
      const h = le16(b, 28) & 0x3fff;
      return w && h ? { width: w, height: h } : null;
    }
    if (tag === "VP8L" && b.length >= 25) {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }

  // JPEG: walk the segment chain to a start-of-frame marker.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      // SOF0..SOF15, excluding the non-frame markers DHT/JPG/DAC.
      if (
        marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      ) {
        return { height: be16(b, i + 5), width: be16(b, i + 7) };
      }
      const len = be16(b, i + 2);
      if (len <= 0) break;
      i += 2 + len;
    }
    return null;
  }

  return null;
}

function fit(size: ImageSize, maxLongEdge: number): ImageSize {
  const long = Math.max(size.width, size.height);
  if (long <= maxLongEdge) return size;
  const k = maxLongEdge / long;
  return {
    width: Math.round(size.width * k),
    height: Math.round(size.height * k),
  };
}

function anthropicTokens(size: ImageSize): number {
  // Anthropic downscales to a long edge of 1568 px / ~1.15 MP before charging.
  let s = fit(size, 1568);
  const px = s.width * s.height;
  if (px > 1_150_000) {
    const k = Math.sqrt(1_150_000 / px);
    s = { width: Math.round(s.width * k), height: Math.round(s.height * k) };
  }
  return Math.ceil((s.width * s.height) / 750);
}

function openaiTokens(size: ImageSize): number {
  let s = fit(size, 2048);
  const short = Math.min(s.width, s.height);
  if (short > 768) {
    const k = 768 / short;
    s = { width: Math.round(s.width * k), height: Math.round(s.height * k) };
  }
  const tiles = Math.ceil(s.width / 512) * Math.ceil(s.height / 512);
  return 85 + 170 * tiles;
}

function googleTokens(size: ImageSize): number {
  if (size.width <= 384 && size.height <= 384) return 258;
  const tiles = Math.ceil(size.width / 768) * Math.ceil(size.height / 768);
  return 258 * Math.max(1, tiles);
}

export type MediaSource = {
  mediaType?: string;
  /** Base64 payload or data: URL. */
  data?: string;
  /** Known byte size, when the payload itself isn't at hand. */
  bytes?: number;
};

export function imageTokens(src: MediaSource, model: MediaCostModel): number {
  const size = imageDimensions(src.data);
  if (!size || size.width <= 0 || size.height <= 0) return DEFAULT_IMAGE_TOKENS;
  switch (model) {
    case "anthropic":
      return anthropicTokens(size);
    case "openai":
      return openaiTokens(size);
    case "google":
      return googleTokens(size);
    default:
      return Math.min(DEFAULT_IMAGE_TOKENS, anthropicTokens(size));
  }
}

/** Text-ish media types we can count exactly rather than guess at. */
function isTextual(mediaType?: string): boolean {
  if (!mediaType) return false;
  return (
    mediaType.startsWith("text/") ||
    /(json|xml|yaml|javascript|typescript|csv|markdown|x-sh)/i.test(mediaType)
  );
}

export function isImageMedia(mediaType?: string): boolean {
  return typeof mediaType === "string" && mediaType.startsWith("image/");
}

/**
 * Cost of a non-image attachment. Textual payloads are decoded and counted for
 * real; anything binary (PDF and friends) gets the flat constant.
 */
export function documentTokens(
  src: MediaSource,
  countText: (s: string) => number,
): number {
  if (isTextual(src.mediaType) && src.data) {
    const decoded = headerBytes(src.data, 1024 * 1024);
    if (decoded) {
      try {
        return countText(new TextDecoder().decode(decoded));
      } catch {
        /* fall through to the constant */
      }
    }
  }
  if (src.bytes && src.bytes > 0) {
    // A rough floor for binary payloads, still far better than 64 characters.
    return Math.max(DEFAULT_DOCUMENT_TOKENS, Math.ceil(src.bytes / 1000));
  }
  return DEFAULT_DOCUMENT_TOKENS;
}
