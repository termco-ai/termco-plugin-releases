/**
 * Pure builders for the isolated-world scripts the AI uses to read and act on
 * an embedded page. Running in an isolated world means: unaffected by the
 * page's CSP, invisible to page JS, but sharing the live DOM. The ref map
 * (`globalThis.__termcoAiRefs`) lives in that world, so navigation — which
 * resets the world — automatically invalidates every ref. `main` only tracks
 * the epoch counter and stamps `s{epoch}` onto refs so a ref from a superseded
 * snapshot is rejected instead of mis-resolving.
 *
 * These are string builders (no `electron` import) so they can be unit-tested
 * and their output asserted with golden tests.
 */

/** JSON payload returned by the snapshot script. */
export interface SnapshotResult {
  epoch: number;
  title: string;
  url: string;
  scrollY: number;
  viewportH: number;
  docH: number;
  text: string;
  truncated: boolean;
}

export const AI_WORLD_ID = 1013;

/** Max characters of snapshot text handed to the model. */
export const SNAPSHOT_CHAR_CAP = 10_000;

/**
 * Builds the DOM-walk snapshot script for a given epoch and filter. Interactive
 * elements get `[ref=s{epoch}e{n}]`; the ref→element map is stored in the
 * isolated world. `filter="viewport"` keeps only elements intersecting the
 * visible band (± one screen); `"full"` walks the whole document.
 */
export function snapshotSource(
  epoch: number,
  filter: "viewport" | "full",
): string {
  return `(() => {
  const EPOCH = ${epoch};
  const FILTER = ${JSON.stringify(filter)};
  const CAP = ${SNAPSHOT_CHAR_CAP};
  const refs = new Map();
  globalThis.__termcoAiRefs = refs;
  globalThis.__termcoAiEpoch = EPOCH;
  let n = 0;

  const INTERACTIVE_TAGS = new Set(["A","BUTTON","INPUT","SELECT","TEXTAREA","SUMMARY"]);
  const INPUT_ROLE = { text:"textbox", search:"textbox", email:"textbox", url:"textbox",
    tel:"textbox", password:"textbox", number:"textbox", checkbox:"checkbox",
    radio:"radio", range:"slider", submit:"button", button:"button", reset:"button" };

  const vh = innerHeight || document.documentElement.clientHeight || 0;

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
    if (el.hidden) return false;
    return true;
  };

  const inViewportBand = (el) => {
    if (FILTER === "full") return true;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    return r.bottom >= -vh && r.top <= vh * 2;
  };

  const roleOf = (el) => {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName;
    if (tag === "A") return el.getAttribute("href") ? "link" : "text";
    if (tag === "BUTTON" || tag === "SUMMARY") return "button";
    if (tag === "SELECT") return "combobox";
    if (tag === "TEXTAREA") return "textbox";
    if (tag === "INPUT") return INPUT_ROLE[(el.getAttribute("type") || "text").toLowerCase()] || "textbox";
    if (/^H[1-6]$/.test(tag)) return "heading";
    if (tag === "IMG") return "img";
    return "text";
  };

  const clip = (s, n) => { s = (s || "").replace(/\\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };

  const accName = (el) => {
    const aria = el.getAttribute("aria-label");
    if (aria) return aria;
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const t = labelledby.split(/\\s+/).map((id) => document.getElementById(id)?.innerText || "").join(" ").trim();
      if (t) return t;
    }
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
      if (el.id) {
        const lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (lab && lab.innerText.trim()) return lab.innerText;
      }
      const wrap = el.closest("label");
      if (wrap && wrap.innerText.trim()) return wrap.innerText;
      if (el.getAttribute("placeholder")) return el.getAttribute("placeholder");
      if (el.getAttribute("name")) return el.getAttribute("name");
    }
    if (el.tagName === "IMG") return el.getAttribute("alt") || "";
    return el.innerText || el.textContent || "";
  };

  const isInteractive = (el) => {
    if (INTERACTIVE_TAGS.has(el.tagName)) {
      if (el.tagName === "INPUT" && el.type === "hidden") return false;
      if (el.disabled) return false;
      return true;
    }
    const role = el.getAttribute("role");
    if (role && ["button","link","checkbox","radio","tab","menuitem","switch","combobox","textbox"].includes(role)) return true;
    if (el.hasAttribute("contenteditable") && el.getAttribute("contenteditable") !== "false") return true;
    if (el.tabIndex >= 0 && el.onclick) return true;
    return false;
  };

  const ownText = (el) => {
    let t = "";
    for (const node of el.childNodes) {
      if (node.nodeType === 3) t += node.textContent;
    }
    return t.trim();
  };

  const lines = [];
  let truncated = false;
  const walk = (el, depth) => {
    if (!(el instanceof Element) || !visible(el)) return;
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "SVG") return;
    const pad = "  ".repeat(Math.min(depth, 12));
    let childDepth = depth;
    if (isInteractive(el)) {
      if (inViewportBand(el)) {
        const ref = "s" + EPOCH + "e" + (++n);
        refs.set(ref, el);
        const role = roleOf(el);
        const name = clip(accName(el), 80);
        let extra = "";
        if (tag === "INPUT" || tag === "TEXTAREA") {
          const type = (el.getAttribute("type") || "text").toLowerCase();
          extra = ' value="' + clip(el.value || "", 40) + '"' + (type === "password" ? " (password)" : "");
        } else if (tag === "A" && el.getAttribute("href")) {
          extra = " " + clip(el.getAttribute("href"), 60);
        }
        lines.push(pad + '- ' + role + ' "' + name + '" [ref=' + ref + ']' + extra);
        childDepth = depth + 1;
      }
    } else {
      const role = roleOf(el);
      if (role === "heading" && inViewportBand(el)) {
        lines.push(pad + '- heading "' + clip(el.innerText, 80) + '" (' + tag.toLowerCase() + ')');
        childDepth = depth + 1;
      } else {
        const t = ownText(el);
        if (t && inViewportBand(el)) {
          lines.push(pad + '- text: "' + clip(t, 200) + '"');
        }
      }
    }
    for (const child of el.children) {
      if (lines.join("\\n").length > CAP) { truncated = true; break; }
      walk(child, childDepth);
    }
  };
  if (document.body) walk(document.body, 0);

  let text = lines.join("\\n");
  if (text.length > CAP) { text = text.slice(0, CAP); truncated = true; }

  return JSON.stringify({
    epoch: EPOCH,
    title: document.title,
    url: location.href,
    scrollY: Math.round(scrollY),
    viewportH: vh,
    docH: document.documentElement.scrollHeight,
    text,
    truncated,
  });
})()`;
}

/**
 * Builds the script that resolves a ref to a clickable point: scrolls the
 * element into view, then returns its viewport-relative center in CSS px.
 * Returns null if the ref is unknown/detached or the epoch has been superseded.
 */
export function resolveRefSource(ref: string, epoch: number): string {
  return `(() => {
  if (globalThis.__termcoAiEpoch !== ${epoch}) return null;
  const el = globalThis.__termcoAiRefs && globalThis.__termcoAiRefs.get(${JSON.stringify(ref)});
  if (!el || !el.isConnected) return null;
  el.scrollIntoView({ block: "center", inline: "center" });
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
    tag: el.tagName,
    type: (el.getAttribute && el.getAttribute("type") || "").toLowerCase(),
    isPassword: el.tagName === "INPUT" && (el.getAttribute("type") || "").toLowerCase() === "password",
  };
})()`;
}

/**
 * Builds the element-picker script: overlays a highlight that follows the
 * pointer and resolves (as a Promise) with the clicked element's rect + text
 * when the user clicks, or null on Escape. Runs in the isolated world so the
 * overlay and listeners are invisible to and un-clobberable by page JS.
 */
export function pickerSource(): string {
  return `(() => new Promise((resolve) => {
  const prev = globalThis.__termcoAiPickCleanup;
  if (prev) prev();
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #3b82f6;background:rgba(59,130,246,0.15);border-radius:3px;transition:all 40ms ease;";
  document.documentElement.appendChild(box);
  let current = null;
  const move = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === box) return;
    current = el;
    const r = el.getBoundingClientRect();
    box.style.left = r.left + "px"; box.style.top = r.top + "px";
    box.style.width = r.width + "px"; box.style.height = r.height + "px";
  };
  const cleanup = () => {
    document.removeEventListener("mousemove", move, true);
    document.removeEventListener("click", click, true);
    document.removeEventListener("keydown", key, true);
    box.remove();
    globalThis.__termcoAiPickCleanup = null;
  };
  const click = (e) => {
    e.preventDefault(); e.stopPropagation();
    const el = current || document.elementFromPoint(e.clientX, e.clientY);
    cleanup();
    if (!el) { resolve(null); return; }
    const r = el.getBoundingClientRect();
    resolve({
      rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
      text: (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 2000),
      tag: el.tagName.toLowerCase(),
      role: (el.getAttribute("role") || "").trim().slice(0, 100) || undefined,
      accessibleName: (
        el.getAttribute("aria-label") ||
        el.getAttribute("alt") ||
        el.getAttribute("title") ||
        el.labels?.[0]?.innerText ||
        el.getAttribute("placeholder") ||
        ""
      ).replace(/\\s+/g, " ").trim().slice(0, 500) || undefined,
    });
  };
  const key = (e) => { if (e.key === "Escape") { cleanup(); resolve(null); } };
  globalThis.__termcoAiPickCleanup = cleanup;
  document.addEventListener("mousemove", move, true);
  document.addEventListener("click", click, true);
  document.addEventListener("keydown", key, true);
}))()`;
}

/** Builds the script that cancels an in-flight picker. */
export function pickerCancelSource(): string {
  return `(() => { const c = globalThis.__termcoAiPickCleanup; if (c) c(); return true; })()`;
}

/** Builds the script that scrolls the page by a fraction of the viewport. */
export function scrollSource(direction: "up" | "down", fraction: number): string {
  const sign = direction === "up" ? -1 : 1;
  return `(() => {
  const dy = Math.round(innerHeight * ${fraction}) * ${sign};
  scrollBy({ top: dy, behavior: "instant" in document.documentElement.style || true ? "auto" : "auto" });
  return { scrollY: Math.round(scrollY), docH: document.documentElement.scrollHeight, viewportH: innerHeight };
})()`;
}
