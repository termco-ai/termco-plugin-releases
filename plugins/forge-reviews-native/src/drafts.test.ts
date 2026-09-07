import { afterEach, expect, it } from "vitest";
import { forgeReviewDrafts } from "./drafts";

const key = "draft-reconciliation-test";
afterEach(() => forgeReviewDrafts.clear(key));
it("preserves edits to the submitted draft while removing unchanged successes", () => {
  const edited = forgeReviewDrafts.add(key, { path: null, line: null, side: null, body: "original" });
  forgeReviewDrafts.add(key, { path: null, line: null, side: null, body: "unchanged" });
  const sent = [...forgeReviewDrafts.snapshot(key)];
  forgeReviewDrafts.update(key, edited.id, "new feedback");
  const added = forgeReviewDrafts.add(key, { path: null, line: null, side: null, body: "arrived during submission" });
  forgeReviewDrafts.reconcile(key, sent, []);
  expect(forgeReviewDrafts.snapshot(key)).toEqual([
    { ...edited, body: "new feedback" }, added,
  ]);
});
it("preserves failed drafts and newer versions during partial submission", () => {
  const draft = forgeReviewDrafts.add(key, { path: null, line: null, side: null, body: "original" });
  forgeReviewDrafts.update(key, draft.id, "revised");
  forgeReviewDrafts.reconcile(key, [draft], [draft]);
  expect(forgeReviewDrafts.snapshot(key)[0].body).toBe("revised");
});

it("does not retry an already published snapshot when a newer edit shares its ID", () => {
  const sent = forgeReviewDrafts.add(key, { body: "sent", path: null, line: null, side: null });
  const failed = forgeReviewDrafts.add(key, { body: "failed", path: null, line: null, side: null });
  forgeReviewDrafts.update(key, sent.id, "new local feedback");
  expect(forgeReviewDrafts.reconcile(key, [sent, failed], [failed])).toEqual([failed]);
  expect(forgeReviewDrafts.snapshot(key).map((draft) => draft.body)).toEqual(["new local feedback", "failed"]);
});
