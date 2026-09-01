# Plugin boundary

- Own the onboarding checklist, coach mark, spotlight geometry, keyboard behavior, and onboarding commands here.
- Read journeys and targets only through `@termco/onboarding-base`.
- Do not hard-code feature selectors or feature-owned navigation in this plugin.
- Keep target observation bounded to the active step and dispose every lease/listener.
