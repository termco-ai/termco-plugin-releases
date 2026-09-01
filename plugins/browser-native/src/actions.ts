/**
 * CDP action primitives (Playwright-style). A click is NOT a blind
 * center-of-box coordinate — it's: scroll the element into view, wait for
 * layout to settle, take Chromium's content quads, and pick a point that
 * `document.elementFromPoint` confirms actually hits the target (or a
 * descendant) before dispatching trusted `Input.dispatchMouseEvent`. If no
 * point hits (occluded / off-screen), we return an error instead of clicking
 * the wrong element — which is exactly the Google-Images "wrong thumbnail"
 * failure this replaces.
 */
import type { WebContents } from "electron";
import { send } from "./cdp";

export interface Point {
  x: number;
  y: number;
}

/**
 * Pure: candidate click points for an element, best-first. Each CDP content
 * quad is 8 numbers (4 corners); we try its centroid, then points nudged
 * toward the centroid from each corner (helps when the centroid lands in a gap
 * or on a child that isn't the target).
 */
export function quadCandidatePoints(quads: number[][]): Point[] {
  const points: Point[] = [];
  for (const q of quads) {
    if (q.length < 8) continue;
    const xs = [q[0], q[2], q[4], q[6]];
    const ys = [q[1], q[3], q[5], q[7]];
    const cx = (xs[0] + xs[1] + xs[2] + xs[3]) / 4;
    const cy = (ys[0] + ys[1] + ys[2] + ys[3]) / 4;
    points.push({ x: cx, y: cy });
    for (let i = 0; i < 4; i++) {
      points.push({ x: (xs[i] + cx) / 2, y: (ys[i] + cy) / 2 });
    }
  }
  return points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
}

/** Resolve a backend node to a Runtime objectId, or null. */
async function resolveObjectId(
  wc: WebContents,
  backendNodeId: number,
): Promise<string | null> {
  try {
    const res = await send<{ object?: { objectId?: string } }>(
      wc,
      "DOM.resolveNode",
      { backendNodeId },
    );
    return res.object?.objectId ?? null;
  } catch {
    return null;
  }
}

/** Await two animation frames so lazy-load/reflow settles before measuring. */
async function settleLayout(wc: WebContents): Promise<void> {
  await send(wc, "Runtime.evaluate", {
    expression:
      "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(1))))",
    awaitPromise: true,
  }).catch(() => {});
}

/**
 * Find a click point that hit-tests to the element. Scrolls into view, settles
 * layout, then verifies each candidate with `elementFromPoint` run against the
 * element's own handle (so a descendant counts as a hit). Null → occluded.
 */
export async function resolveClickPoint(
  wc: WebContents,
  backendNodeId: number,
): Promise<Point | null> {
  await send(wc, "DOM.scrollIntoViewIfNeeded", { backendNodeId }).catch(
    () => {},
  );
  await settleLayout(wc);

  const objectId = await resolveObjectId(wc, backendNodeId);
  if (!objectId) return null;

  let quads: number[][] = [];
  try {
    const res = await send<{ quads?: number[][] }>(
      wc,
      "DOM.getContentQuads",
      { backendNodeId },
    );
    quads = res.quads ?? [];
  } catch {
    quads = [];
  }
  if (quads.length === 0) return null;

  for (const p of quadCandidatePoints(quads)) {
    try {
      const hit = await send<{ result?: { value?: unknown } }>(
        wc,
        "Runtime.callFunctionOn",
        {
          objectId,
          functionDeclaration:
            "function(x,y){const t=document.elementFromPoint(x,y);return !!t&&(t===this||this.contains(t)||t.contains(this));}",
          arguments: [{ value: p.x }, { value: p.y }],
          returnByValue: true,
        },
      );
      if (hit.result?.value === true) return p;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/**
 * Trusted click on a ref. CDP resolves a hit-tested, stable point (the smart
 * part that fixes wrong-element clicks); Electron's `sendInputEvent` then
 * dispatches the actual click. We deliberately do NOT click via CDP
 * `Input.dispatchMouseEvent`: on an embedded WebContentsView it fires JS click
 * handlers but does not trigger the browser's default action (anchor
 * navigation, form submit), whereas `sendInputEvent` does. Returns an error if
 * no point hits the element.
 */
export async function cdpClick(
  wc: WebContents,
  backendNodeId: number,
  opts: { button?: "left" | "right"; double?: boolean } = {},
): Promise<{ ok: true } | { error: string }> {
  const point = await resolveClickPoint(wc, backendNodeId);
  if (!point) {
    return {
      error:
        "element is off-screen or covered by another element — scroll to it or call browser_read_page again",
    };
  }
  const button = opts.button ?? "left";
  const clickCount = opts.double ? 2 : 1;
  const { x, y } = point;
  wc.focus();
  wc.sendInputEvent({ type: "mouseMove", x, y });
  wc.sendInputEvent({ type: "mouseDown", x, y, button, clickCount });
  wc.sendInputEvent({ type: "mouseUp", x, y, button, clickCount });
  return { ok: true };
}

/** Flat CDP attribute array [name, value, name, value, …] → value. */
function attr(attrs: string[] | undefined, name: string): string | null {
  if (!attrs) return null;
  for (let i = 0; i < attrs.length - 1; i += 2) {
    if (attrs[i] === name) return attrs[i + 1];
  }
  return null;
}

/** Whether a ref points to an `<input type=password>` — drives the approval gate. */
export async function isPasswordField(
  wc: WebContents,
  backendNodeId: number,
): Promise<boolean> {
  try {
    const desc = await send<{
      node?: { localName?: string; nodeName?: string; attributes?: string[] };
    }>(wc, "DOM.describeNode", { backendNodeId });
    const node = desc.node;
    const tag = (node?.localName ?? node?.nodeName ?? "").toLowerCase();
    return tag === "input" && attr(node?.attributes, "type") === "password";
  } catch {
    return false;
  }
}

/**
 * Type into a ref: CDP resolves a hit-tested point; Electron
 * `sendInputEvent`/`insertText` do the actual trusted typing (same reason as
 * clicking — CDP input doesn't fire default actions like Enter-to-submit on an
 * embedded view). Password fields are gated at the approval layer, not refused
 * here — the user confirms each password entry.
 */
export async function cdpType(
  wc: WebContents,
  backendNodeId: number,
  text: string,
  opts: { submit?: boolean; clear?: boolean } = {},
): Promise<{ ok: true } | { error: string }> {
  const point = await resolveClickPoint(wc, backendNodeId);
  if (!point) {
    return {
      error:
        "field is off-screen or covered by another element — scroll to it or call browser_read_page again",
    };
  }
  const { x, y } = point;
  wc.focus();
  wc.sendInputEvent({ type: "mouseMove", x, y });
  wc.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
  wc.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
  if (opts.clear) {
    wc.selectAll();
    wc.sendInputEvent({ type: "keyDown", keyCode: "Backspace" });
    wc.sendInputEvent({ type: "keyUp", keyCode: "Backspace" });
  }
  wc.insertText(text);
  if (opts.submit) {
    wc.sendInputEvent({ type: "keyDown", keyCode: "Return" });
    wc.sendInputEvent({ type: "char", keyCode: "\r" });
    wc.sendInputEvent({ type: "keyUp", keyCode: "Return" });
  }
  return { ok: true };
}

/** Move the pointer over a ref's hit-tested point (opens hover menus). */
export async function cdpHover(
  wc: WebContents,
  backendNodeId: number,
): Promise<{ ok: true } | { error: string }> {
  const point = await resolveClickPoint(wc, backendNodeId);
  if (!point)
    return { error: "element is off-screen or covered — re-read the page" };
  wc.focus();
  wc.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y });
  return { ok: true };
}

/** Select option(s) in a native <select> by value or visible text. */
export async function cdpSelectOption(
  wc: WebContents,
  backendNodeId: number,
  values: string[],
): Promise<{ ok: true; selected: string[] } | { error: string }> {
  await send(wc, "DOM.scrollIntoViewIfNeeded", { backendNodeId }).catch(
    () => {},
  );
  const objectId = await resolveObjectId(wc, backendNodeId);
  if (!objectId) return { error: "ref not found — re-read the page" };
  try {
    const res = await send<{ result?: { value?: string[] } }>(
      wc,
      "Runtime.callFunctionOn",
      {
        objectId,
        functionDeclaration:
          "function(values){if(this.tagName!=='SELECT')return null;for(const o of this.options){o.selected=values.includes(o.value)||values.includes(o.label)||values.includes((o.textContent||'').trim());}this.dispatchEvent(new Event('input',{bubbles:true}));this.dispatchEvent(new Event('change',{bubbles:true}));return [...this.options].filter(o=>o.selected).map(o=>o.value);}",
        arguments: [{ value: values }],
        returnByValue: true,
      },
    );
    const selected = res.result?.value;
    if (!selected) return { error: "element is not a <select>" };
    return { ok: true, selected };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Set the files on a file <input> (trusted, via CDP). */
export async function cdpUpload(
  wc: WebContents,
  backendNodeId: number,
  paths: string[],
): Promise<{ ok: true } | { error: string }> {
  try {
    await send(wc, "DOM.setFileInputFiles", { files: paths, backendNodeId });
    return { ok: true };
  } catch (e) {
    return {
      error: `file upload failed (is the ref a file input?): ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
