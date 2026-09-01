import type { AiBrowserPolicyCapability } from "@termco/ai-tools-base";

let policy: AiBrowserPolicyCapability | null = null;

export function aiBrowserPolicyActive(): boolean {
  return policy !== null;
}

export function configureBrowserPolicy(
  capability: AiBrowserPolicyCapability | null,
): () => void {
  policy = capability;
  return () => {
    if (policy === capability) policy = null;
  };
}

export function allowCurrentBrowserOrigin(
  sessionId: string,
  tabId: number,
): Promise<string | null> {
  return policy?.allowCurrentOrigin(sessionId, tabId) ?? Promise.resolve(null);
}
