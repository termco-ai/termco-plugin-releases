export * from "./forgeReviews";

export const FORGE_REVIEWS_SERVICE = "forge.reviews" as const;

declare module "@termco/kernel" {
  interface Services {
    [FORGE_REVIEWS_SERVICE]: import("./forgeReviews").ForgeReviewsCapability;
  }
}
