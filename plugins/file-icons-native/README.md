# File Icons

This protected UI provider owns the stable `ui.file-icons` registry and generic
file/folder fallbacks. Explorer contributes its richer catalogue with the
stable `explorer.catalogue` resolver ID. When Explorer leaves, consumers keep
the same registry object and immediately fall back to generic icons.
