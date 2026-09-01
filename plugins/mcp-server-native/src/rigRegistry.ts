/**
 * A main-process mirror of the renderer's rigs (id + root path), used to
 * resolve which rig an external MCP caller targets. The renderer owns rig
 * state; it pushes a compact `{id, name, root}[]` snapshot here whenever it
 * changes (and on rig deletion we revoke that rig's tokens elsewhere).
 *
 * Rig resolution for a working directory is longest-prefix over the roots, so
 * a caller in `/repo/pkg/a` resolves to a rig rooted at `/repo/pkg` over one
 * rooted at `/repo`.
 */

export type RigMirrorEntry = { id: string; name: string; root: string };

export function createRigRegistry() {
  let rigs: RigMirrorEntry[] = [];

  function set(next: RigMirrorEntry[]): void {
    rigs = next.filter((r) => r && typeof r.id === "string" && typeof r.root === "string");
  }

  function list(): RigMirrorEntry[] {
    return rigs;
  }

  function byId(id: string): RigMirrorEntry | undefined {
    return rigs.find((r) => r.id === id);
  }

  /** Longest-root-prefix match for a working directory, or null. */
  function resolveByCwd(cwd: string): RigMirrorEntry | null {
    if (!cwd) return null;
    const norm = normalize(cwd);
    let best: RigMirrorEntry | null = null;
    for (const rig of rigs) {
      const root = normalize(rig.root);
      if (norm === root || norm.startsWith(`${root}/`)) {
        if (!best || root.length > normalize(best.root).length) best = rig;
      }
    }
    return best;
  }

  return { set, list, byId, resolveByCwd };
}

export type RigRegistry = ReturnType<typeof createRigRegistry>;

/** Strip a trailing slash so `/a/` and `/a` compare equal (root never `/`). */
function normalize(p: string): string {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}
// Owned by the mcp-server-native provider plugin.
