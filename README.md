# Termco plugins

This repository is the source and signed release feed for Termco's independently
updated feature plugins. The Electron application contains only its host,
contract packages, and recovery-critical plugins. On first launch it downloads
the latest complete set published here; later launches check this feed for a
new compatible set.

## Support and proposals

This repository is maintained as plugin source and signed distribution
infrastructure. Users should report plugin problems through the centralized
[Termco plugin bug form](https://github.com/termco-ai/termco/issues/new?template=02-plugin-bug.yml)
and propose new or changed plugins in
[Termco Plugin ideas](https://github.com/termco-ai/termco/discussions/categories/plugin-ideas).
That lets maintainers route a report without requiring users to know which
repository owns the implementation.

## Trust model

Every GitHub Release contains exactly two assets:

- `termco-plugin-release.json` — versions, Termco compatibility, archive digest,
  and an Ed25519 publisher signature.
- `plugins-*.zip` — the complete source-owned feature-plugin snapshot.

Termco embeds only the public verification key. The private signing key is held
as the `PLUGIN_RELEASE_PRIVATE_KEY` Actions secret and is never committed.
Downloaded archives are size-limited, digest-checked, signature-verified,
compiled in staging, and activated only after the complete set succeeds.

## Repository layout

```text
plugins/                  Feature plugins and shared contract packages
profiles/default/         Ordered official plugin set
scripts/                  Deterministic signed release builder
.github/workflows/        Validation and release publishing
host-runtime-packages.json Packages supplied by the compatible Termco host
```

Each executable plugin owns its manifest, package metadata, tests, README,
optional `CHANGELOG.md`, and `AGENTS.md`. The README is the stable guide to what
the plugin does; the changelog records user-facing changes by exact plugin
version. Contract packages end in `-base`; they describe the stable seam
between independently released plugins and the host. `AGENTS.md` remains in
source for maintainers and coding agents but is deliberately excluded from the
downloadable archive because it is not a runtime input.

## Releasing

Plugin versions use `major.minor.patch`. Change the plugin source and increment
its manifest version. A push to `main` validates the repository and publishes a
complete signed snapshot. Complete snapshots let a fresh Termco installation
start directly from the latest release without replaying historical deltas.

For user-visible changes, add an exact version entry to the plugin's
`CHANGELOG.md`:

```markdown
# Changelog

## 1.2.0

Explains the user-visible change and why it matters.
```

The release builder uses that exact entry as the plugin's release note. An
explicit release-notes file still takes precedence for exceptional releases;
plugins without a matching changelog entry fall back to their manifest
description so existing plugins can adopt changelogs incrementally.

The workflow requires:

- Repository variable `PLUGIN_RELEASE_KEY_ID`
- Repository secret `PLUGIN_RELEASE_PRIVATE_KEY`

Termco `0.9.x` accepts releases with `minApplicationVersion` `0.9.0` and an
exclusive maximum of `1.0.0`. Change the compatibility file only alongside a
review of the host/plugin contract.

## Local validation

```bash
pnpm install --frozen-lockfile
pnpm test
```

Generated archives belong in `plugin-release-artifacts/` and are ignored by
Git.
