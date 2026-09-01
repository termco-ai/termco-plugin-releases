# Plugin-owned onboarding contract

User-facing plugins own their journeys, copy, semantic targets, and contextual discovery. Internal provider and contract plugins do not need to invent a tour when they have no user-facing workflow.

Register guidance with `contributeOnboarding(context, contribution)`. Registration is optional and lifecycle-owned: the feature still activates without `onboarding.registry`, and unloading the plugin removes its journeys and targets immediately.

Use `presentation: "contextual"` for advanced features and call `onboarding.runtime.suggest(journeyId)` when the user first enters the relevant surface. Dismissals and progress keep the suggestion quiet afterward. All active journeys remain replayable through Getting Started.

Product-level story plugins may compose target IDs supplied by feature owners, but must not duplicate private DOM selectors or feature copy. A portable profile naturally carries a customized plugin's guidance with its source.
