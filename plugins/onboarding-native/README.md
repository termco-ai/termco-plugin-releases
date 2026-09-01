# Onboarding Runtime

Composes lifecycle-owned onboarding contributions and stores version-aware local progress through `settings.preferences`.

Feature owners may request a contextual offer through `onboarding.runtime.suggest`. Completed, in-progress, or dismissed journeys stay quiet, and removing the owning plugin withdraws any live offer.

Provides:

- `onboarding.registry`
- `onboarding.runtime`

It owns no product copy or visual surface.
