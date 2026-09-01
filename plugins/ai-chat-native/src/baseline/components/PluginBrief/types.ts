export type PluginBrief = {
  revision: number;
  title: string;
  outcome: string;
  userJourney: string;
  experience: {
    location: string;
    interaction: string;
    states: string[];
  };
  scope: {
    included: string[];
    excluded: string[];
  };
  acceptanceCriteria: string[];
  onboarding?:
    | {
        decision: "include";
        rationale: string;
        journey: {
          id: string;
          title: string;
          description: string;
          presentation: "contextual" | "available";
          steps: Array<{ id: string; title: string }>;
        };
      }
    | { decision: "omit" | "not-applicable"; rationale: string };
  authoring: {
    intent: "create" | "fork" | "replace";
    plugin: { id: string; name: string; description: string; category: string };
    sourcePluginId?: string;
    target: string;
    variant?: string;
    contributions: unknown[];
    reveal: "auto" | "offer" | "none";
  };
};

export type PluginBriefOutput = {
  action: "confirm" | "revise" | "continue-interview" | "cancel";
  note?: string;
};
