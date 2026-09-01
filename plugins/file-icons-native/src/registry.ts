import type {
  FileIconResolver,
  UiFileIconsCapability,
  UiFileIconsSnapshot,
} from "@termco/files-base";

function dataIcon(kind: "file" | "folder", expanded = false): string {
  const body =
    kind === "file"
      ? '<path fill="#8b95a7" d="M4 1.5h5l3 3V14.5H4z"/><path fill="#b6bfcc" d="M9 1.5v3h3z"/>'
      : `<path fill="${expanded ? "#d6a84b" : "#b98b35"}" d="M1.5 3.5h5l1.4 1.6h6.6v8.4h-13z"/>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${body}</svg>`,
  )}`;
}

export function createFileIconRegistry(): UiFileIconsCapability {
  const listeners = new Set<() => void>();
  const ranks = new Map<string, number>();
  let nextRank = 0;
  let revision = 0;
  let resolvers: readonly FileIconResolver[] = [];
  let snapshot: UiFileIconsSnapshot = { revision, resolverIds: [] };
  const publish = () => {
    revision += 1;
    snapshot = {
      revision,
      resolverIds: resolvers.map(({ id }) => id),
    };
    for (const listener of listeners) listener();
  };
  const resolve = (
    select: (resolver: FileIconResolver) => string | null,
    fallback: string,
  ) => {
    for (const resolver of resolvers) {
      try {
        const value = select(resolver);
        if (value) return value;
      } catch {
        // A broken optional resolver must not remove generic file presentation.
      }
    }
    return fallback;
  };
  return {
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    registerResolver(resolver) {
      if (resolvers.some(({ id }) => id === resolver.id)) {
        throw new Error(`file icon resolver "${resolver.id}" is already registered`);
      }
      if (!ranks.has(resolver.id)) ranks.set(resolver.id, nextRank++);
      resolvers = [...resolvers, resolver].sort(
        (left, right) =>
          (right.priority ?? 0) - (left.priority ?? 0) ||
          (ranks.get(left.id) ?? 0) - (ranks.get(right.id) ?? 0),
      );
      publish();
      let registered = true;
      return () => {
        if (!registered) return;
        registered = false;
        resolvers = resolvers.filter((candidate) => candidate !== resolver);
        publish();
      };
    },
    fileIconUrl(name) {
      return resolve((resolver) => resolver.fileIconUrl(name), dataIcon("file"));
    },
    folderIconUrl(name, expanded) {
      return resolve(
        (resolver) => resolver.folderIconUrl(name, expanded),
        dataIcon("folder", expanded),
      );
    },
  };
}
