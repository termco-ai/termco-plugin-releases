/**
 * Builds the numbered-ref page snapshot from Chromium's accessibility tree
 * (`Accessibility.getFullAXTree`). Roles and accessible names are computed by
 * Chromium — so image tiles, icon buttons, and aria-labelled controls get real
 * distinguishing names instead of the empty strings the hand-rolled DOM walk
 * produced. Each interactive node gets `[ref=s{epoch}e{n}]` mapped to its
 * `backendDOMNodeId` (a document-stable handle CDP actions operate on).
 *
 * The tree walk + text formatting is a pure function (`buildAxSnapshot`) so it
 * is unit-tested against fixed AX node arrays.
 */
import type { WebContents } from "electron";
import { send } from "./cdp";
import { SNAPSHOT_CHAR_CAP, type SnapshotResult } from "./snapshotScript";

interface AXValue {
  value?: unknown;
}
interface AXProperty {
  name: string;
  value?: AXValue;
}
export interface AXNode {
  nodeId: string;
  ignored?: boolean;
  role?: AXValue;
  name?: AXValue;
  value?: AXValue;
  properties?: AXProperty[];
  childIds?: string[];
  backendDOMNodeId?: number;
}

/** AX roles we surface as actionable, matched case-insensitively. */
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "tab",
  "switch",
  "slider",
  "spinbutton",
  "option",
  "treeitem",
  "disclosuretriangle",
]);

function str(v: AXValue | undefined): string {
  return v && typeof v.value === "string" ? v.value : "";
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function displayRole(role: string): string {
  const r = role.toLowerCase();
  if (r === "statictext") return "text";
  if (r === "image") return "img";
  return r;
}

export interface AxSnapshot {
  text: string;
  truncated: boolean;
  /** ref → backendDOMNodeId for CDP actions. */
  refs: Map<string, number>;
}

/**
 * Pure: walk the AX node list into the numbered-ref snapshot text + ref map.
 * `nodes` is the flat array from `Accessibility.getFullAXTree`.
 */
export function buildAxSnapshot(nodes: AXNode[], epoch: number): AxSnapshot {
  const byId = new Map<string, AXNode>();
  for (const n of nodes) byId.set(n.nodeId, n);

  // Root: the RootWebArea, else the first node.
  const root =
    nodes.find((n) => str(n.role).toLowerCase() === "rootwebarea") ?? nodes[0];

  const lines: string[] = [];
  const refs = new Map<string, number>();
  let n = 0;
  let unnamed = 0;
  let truncated = false;
  const seenNames = new Map<string, number>();

  const emit = (depth: number, text: string): boolean => {
    if (lines.join("\n").length + text.length > SNAPSHOT_CHAR_CAP) {
      truncated = true;
      return false;
    }
    lines.push("  ".repeat(Math.min(depth, 12)) + text);
    return true;
  };

  const walk = (node: AXNode | undefined, depth: number): void => {
    if (!node || truncated) return;
    const role = str(node.role);
    const roleLc = role.toLowerCase();
    const ignored = node.ignored === true;
    let childDepth = depth;

    if (!ignored) {
      const name = clip(str(node.name), 80);
      if (INTERACTIVE_ROLES.has(roleLc) && node.backendDOMNodeId != null) {
        const ref = `s${epoch}e${++n}`;
        refs.set(ref, node.backendDOMNodeId);
        // Disambiguate identical (role,name) siblings — common in grids/lists.
        let label = name || `${displayRole(role)} ${++unnamed}`;
        const key = `${roleLc}|${label}`;
        const dup = seenNames.get(key);
        if (dup != null) {
          seenNames.set(key, dup + 1);
          label = `${label} #${dup + 1}`;
        } else {
          seenNames.set(key, 1);
        }
        const val = clip(str(node.value), 40);
        const extra = val ? ` value="${val}"` : "";
        if (emit(depth, `- ${displayRole(role)} "${label}" [ref=${ref}]${extra}`))
          childDepth = depth + 1;
      } else if (roleLc === "heading") {
        if (emit(depth, `- heading "${clip(str(node.name), 80)}"`))
          childDepth = depth + 1;
      } else if (roleLc === "statictext") {
        const t = clip(str(node.name), 200);
        if (t) emit(depth, `- text: "${t}"`);
      }
    }

    for (const id of node.childIds ?? []) walk(byId.get(id), childDepth);
  };

  walk(root, 0);
  return { text: lines.join("\n"), truncated, refs };
}

/**
 * CDP snapshot: fetch the AX tree + scroll geometry, build the snapshot, and
 * return the model-facing result plus the ref → backendDOMNodeId map for the
 * caller to store for this epoch.
 */
export async function cdpSnapshot(
  wc: WebContents,
  epoch: number,
): Promise<{ result: SnapshotResult; refs: Map<string, number> }> {
  const { nodes } = await send<{ nodes: AXNode[] }>(
    wc,
    "Accessibility.getFullAXTree",
  );
  const snap = buildAxSnapshot(nodes ?? [], epoch);

  // Scroll geometry for the "showing X–Y of Z" hint (AX has no boxes).
  let scrollY = 0;
  let viewportH = 0;
  let docH = 0;
  try {
    const geo = await send<{ result?: { value?: unknown } }>(
      wc,
      "Runtime.evaluate",
      {
        expression:
          "JSON.stringify({s:Math.round(scrollY),v:innerHeight,d:document.documentElement.scrollHeight})",
        returnByValue: true,
      },
    );
    const parsed = JSON.parse(String(geo.result?.value ?? "{}"));
    scrollY = parsed.s ?? 0;
    viewportH = parsed.v ?? 0;
    docH = parsed.d ?? 0;
  } catch {
    /* geometry is a nicety; snapshot text is the payload */
  }

  return {
    result: {
      epoch,
      title: wc.getTitle(),
      url: wc.getURL(),
      scrollY,
      viewportH,
      docH,
      text: snap.text,
      truncated: snap.truncated,
    },
    refs: snap.refs,
  };
}
