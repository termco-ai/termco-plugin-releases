import type {
  AiToolContribution,
  AiToolPresentationAdapter,
  AiToolRuntime,
} from "@termco/ai-tools-base";

let contributions: readonly AiToolContribution[] = [];

export function aiToolContributionCount(): number {
  return contributions.length;
}

export function configureToolContributions(
  next: readonly AiToolContribution[],
): () => void {
  const installed = [...next].sort(
    (left, right) => (left.order ?? 0) - (right.order ?? 0),
  );
  contributions = installed;
  return () => {
    if (contributions === installed) contributions = [];
  };
}

export const toolsService = {
  registrations(): readonly AiToolContribution[] {
    return contributions;
  },
  isDisabled(_name: string): boolean {
    return false;
  },
  presentation(toolName: string): AiToolPresentationAdapter | undefined {
    for (const contribution of contributions) {
      const presentation = contribution.presentations?.[toolName];
      if (presentation) return presentation;
    }
    return undefined;
  },
  presentationForRenderer(
    renderer: string,
    interactive?: boolean,
  ): AiToolPresentationAdapter | undefined {
    for (const contribution of contributions) {
      for (const presentation of Object.values(
        contribution.presentations ?? {},
      )) {
        if (
          presentation.renderer === renderer &&
          (interactive === undefined || presentation.interactive === interactive)
        ) {
          return presentation;
        }
      }
    }
    return undefined;
  },
};

export function asPublicToolRuntime(value: unknown): AiToolRuntime {
  return value as AiToolRuntime;
}
