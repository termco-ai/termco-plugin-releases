# Plugin boundary

This directory owns the complete `secrets.application` implementation.

- Do not import Termco application source or another plugin.
- Import lifecycle types from `@termco/kernel` and service contracts and
  constants from their owning `@termco/*-base` packages.
- Keep backend tests inside this plugin.
- Any new OS or package access must be declared in both manifests.
