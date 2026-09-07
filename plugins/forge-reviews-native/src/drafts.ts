import type { ForgeReviewCommentDraft } from "@termco/forge-reviews-base";

export interface StoredForgeReviewDraft extends ForgeReviewCommentDraft {
  id: string;
  createdAt: string;
}

const drafts = new Map<string, StoredForgeReviewDraft[]>();
const listeners = new Set<() => void>();
let revision = 0;
const EMPTY_DRAFTS: readonly StoredForgeReviewDraft[] = [];

export function reviewDraftKey(input: {
  host: string;
  slug: string;
  number: number;
  headSha: string;
}): string {
  return `${input.host}/${input.slug}#${input.number}@${input.headSha}`;
}

function notify(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export const forgeReviewDrafts = {
  revision: () => revision,
  earlierRevisions(key: string): Array<{ key: string; headSha: string; drafts: readonly StoredForgeReviewDraft[] }> {
    const prefix = key.slice(0, key.lastIndexOf("@") + 1);
    if (!prefix) return [];
    return [...drafts].flatMap(([candidate, values]) =>
      candidate !== key && candidate.startsWith(prefix) && values.length > 0
        ? [{ key: candidate, headSha: candidate.slice(prefix.length), drafts: values }] : []);
  },
  snapshot(key: string): readonly StoredForgeReviewDraft[] {
    return drafts.get(key) ?? EMPTY_DRAFTS;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  add(key: string, draft: ForgeReviewCommentDraft): StoredForgeReviewDraft {
    const value: StoredForgeReviewDraft = {
      ...draft,
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      createdAt: new Date().toISOString(),
    };
    drafts.set(key, [...(drafts.get(key) ?? []), value]);
    notify();
    return value;
  },
  remove(key: string, id: string): void {
    drafts.set(
      key,
      (drafts.get(key) ?? []).filter((draft) => draft.id !== id),
    );
    notify();
  },
  update(key: string, id: string, body: string): StoredForgeReviewDraft | null {
    let updated: StoredForgeReviewDraft | null = null;
    drafts.set(
      key,
      (drafts.get(key) ?? []).map((draft) => {
        if (draft.id !== id) return draft;
        updated = { ...draft, body };
        return updated;
      }),
    );
    if (updated) notify();
    return updated;
  },
  replace(key: string, values: readonly ForgeReviewCommentDraft[]): void {
    drafts.set(
      key,
      values.map((draft) => ({
        ...draft,
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        createdAt: new Date().toISOString(),
      })),
    );
    notify();
  },
  reconcile(key: string, sent: readonly StoredForgeReviewDraft[], remaining: readonly ForgeReviewCommentDraft[]): readonly StoredForgeReviewDraft[] {
    const pending = [...remaining];
    const sameDraft = (a: ForgeReviewCommentDraft, b: ForgeReviewCommentDraft) =>
      a.body === b.body && a.path === b.path && a.line === b.line && a.side === b.side && a.replyToId === b.replyToId;
    const sentById = new Map(sent.map((draft) => [draft.id, draft]));
    const keepIds = new Set<string>();
    for (const draft of sent) {
      const index = pending.findIndex((candidate) => sameDraft(draft, candidate));
      if (index >= 0) { keepIds.add(draft.id); pending.splice(index, 1); }
    }
    drafts.set(key, (drafts.get(key) ?? []).filter((draft) => {
      const submitted = sentById.get(draft.id);
      return !submitted || keepIds.has(draft.id) || !sameDraft(draft, submitted);
    }));
    notify();
    return sent.filter((draft) => keepIds.has(draft.id));
  },
  clear(key: string): void {
    drafts.delete(key);
    notify();
  },
};
