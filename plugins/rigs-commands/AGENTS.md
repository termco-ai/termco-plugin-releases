# Rig command ownership

- This folder owns all default Rigs palette commands.
- Import lifecycle types from `@termco/kernel` and service contracts and
  constants from their owning `@termco/*-base` packages.
- Keep collection dynamic so newly created rigs appear without reactivation.
- Never import the header plugin or private application stores.
