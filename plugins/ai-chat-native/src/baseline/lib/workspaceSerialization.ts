export type PaneNode =
  | { kind: "leaf"; id: number; cwd?: string }
  | { kind: "split"; id: number; dir: "row" | "col"; children: PaneNode[] };

type TabBase = { id: number; rigId: string; kind: string; title: string; cold?: boolean };
export type WorkspaceTab =
  | (TabBase & {
      kind: "terminal";
      cwd?: string;
      paneTree: PaneNode;
      activeLeafId: number;
      private?: boolean;
      blocks?: boolean;
      customTitle?: string;
    })
  | (TabBase & { kind: "editor"; path: string; dirty?: boolean; preview?: boolean })
  | (TabBase & { kind: "preview"; url: string })
  | (TabBase & { kind: "markdown"; path: string })
  | (TabBase & { kind: `plugin:${string}`; data?: Record<string, unknown> });

type SerializedNode =
  | { kind: "leaf"; cwd?: string; active?: boolean }
  | { kind: "split"; dir: "row" | "col"; children: SerializedNode[] };

export type SerializedTab =
  | { kind: "terminal"; tree: SerializedNode; blocks?: boolean; customTitle?: string }
  | { kind: "editor"; path: string }
  | { kind: "preview"; url: string }
  | { kind: "markdown"; path: string }
  | { kind: `plugin:${string}`; title: string; data?: Record<string, unknown> };

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

function titleFromUrl(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url || "preview";
  }
}

export function findLeafCwd(node: PaneNode, id: number): string | undefined {
  if (node.kind === "leaf") return node.id === id ? node.cwd : undefined;
  for (const child of node.children) {
    const cwd = findLeafCwd(child, id);
    if (cwd !== undefined) return cwd;
  }
  return undefined;
}

function serializeNode(node: PaneNode, activeLeafId: number): SerializedNode {
  if (node.kind === "leaf") {
    return {
      kind: "leaf",
      ...(node.cwd !== undefined ? { cwd: node.cwd } : {}),
      ...(node.id === activeLeafId ? { active: true } : {}),
    };
  }
  return {
    kind: "split",
    dir: node.dir,
    children: node.children.map((child) => serializeNode(child, activeLeafId)),
  };
}

export function isSerializableTab(tab: WorkspaceTab): boolean {
  if (tab.kind.startsWith("plugin:")) return true;
  return tab.kind === "terminal"
    ? !tab.private
    : ["editor", "preview", "markdown"].includes(tab.kind);
}

export function serializeTabs(tabs: WorkspaceTab[]): SerializedTab[] {
  const serialized: SerializedTab[] = [];
  for (const tab of tabs) {
    if (!isSerializableTab(tab)) continue;
    if (tab.kind === "terminal") {
      serialized.push({
        kind: "terminal",
        tree: serializeNode(tab.paneTree, tab.activeLeafId),
        ...(tab.blocks ? { blocks: true } : {}),
        ...(tab.customTitle !== undefined ? { customTitle: tab.customTitle } : {}),
      });
    } else if (tab.kind === "editor") serialized.push({ kind: "editor", path: tab.path });
    else if (tab.kind === "preview") serialized.push({ kind: "preview", url: tab.url });
    else if (tab.kind === "markdown") serialized.push({ kind: "markdown", path: tab.path });
    else if (tab.kind.startsWith("plugin:")) {
      serialized.push({
        kind: tab.kind,
        title: tab.title,
        ...(tab.data !== undefined ? { data: tab.data } : {}),
      });
    }
  }
  return serialized;
}

function hydrateNode(
  node: SerializedNode,
  allocate: () => number,
  active: { id: number | null },
): PaneNode {
  if (node.kind === "leaf") {
    const id = allocate();
    if (node.active && active.id === null) active.id = id;
    return { kind: "leaf", id, ...(node.cwd !== undefined ? { cwd: node.cwd } : {}) };
  }
  const children = node.children.map((child) => hydrateNode(child, allocate, active));
  if (children.length === 0) return { kind: "leaf", id: allocate() };
  if (children.length === 1) return children[0];
  return { kind: "split", id: allocate(), dir: node.dir, children };
}

function leaves(node: PaneNode): Array<Extract<PaneNode, { kind: "leaf" }>> {
  return node.kind === "leaf" ? [node] : node.children.flatMap(leaves);
}

export function hydrateTabs(
  serialized: SerializedTab[],
  rigId: string,
  allocate: () => number,
): WorkspaceTab[] {
  if (!Array.isArray(serialized)) return [];
  const tabs: WorkspaceTab[] = [];
  for (const source of serialized) {
    try {
      if (source.kind === "terminal") {
        const active = { id: null as number | null };
        const paneTree = hydrateNode(source.tree, allocate, active);
        const allLeaves = leaves(paneTree);
        const activeLeafId = active.id ?? allLeaves[0]?.id ?? allocate();
        const cwd = allLeaves.find((leaf) => leaf.id === activeLeafId)?.cwd ?? allLeaves[0]?.cwd;
        tabs.push({
          id: allocate(),
          rigId,
          kind: "terminal",
          cold: true,
          title: source.customTitle ?? (cwd ? basename(cwd) : source.blocks ? "blocks" : "shell"),
          paneTree,
          activeLeafId,
          ...(cwd !== undefined ? { cwd } : {}),
          ...(source.blocks ? { blocks: true } : {}),
          ...(source.customTitle !== undefined ? { customTitle: source.customTitle } : {}),
        });
      } else if (source.kind === "editor") {
        tabs.push({ id: allocate(), rigId, kind: "editor", cold: true, title: basename(source.path), path: source.path, dirty: false, preview: false });
      } else if (source.kind === "preview") {
        tabs.push({ id: allocate(), rigId, kind: "preview", cold: true, title: titleFromUrl(source.url), url: source.url });
      } else if (source.kind === "markdown") {
        tabs.push({ id: allocate(), rigId, kind: "markdown", cold: true, title: basename(source.path), path: source.path });
      } else if (source.kind.startsWith("plugin:")) {
        tabs.push({ id: allocate(), rigId, kind: source.kind, cold: true, title: source.title, ...(source.data !== undefined ? { data: source.data } : {}) });
      }
    } catch {
      // A single corrupt snapshot entry must not prevent the others restoring.
    }
  }
  return tabs;
}
