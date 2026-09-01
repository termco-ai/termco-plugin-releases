/**
 * OSC 52 clipboard parsing: lets programs running in the terminal set the
 * system clipboard. Input is untrusted, so the payload is size-capped, base64
 * strictly validated, and UTF-8 decoded in `fatal` mode before it ever reaches
 * the real clipboard. Registration lives in streamHandlers.ts.
 */

const MAX_OSC52_CLIPBOARD_BYTES = 1024 * 1024;

export type ClipboardWriter = (text: string) => void | Promise<void>;

export function parseOsc52Clipboard(data: string): string | null {
  const parts = data.split(";");
  if (parts.length < 2) return null;
  const selection = parts[0] || "c";
  if (!selection.includes("c")) return null;
  const encoded = parts.slice(1).join(";");
  if (!encoded || encoded === "?") return null;
  if (encoded.length > Math.ceil((MAX_OSC52_CLIPBOARD_BYTES * 4) / 3) + 4) {
    return null;
  }
  const compact = encoded.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) return null;

  try {
    const bytes = Uint8Array.from(atob(compact), (c) => c.charCodeAt(0));
    if (bytes.byteLength > MAX_OSC52_CLIPBOARD_BYTES) return null;
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
