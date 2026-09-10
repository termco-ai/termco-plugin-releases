# Changelog

## 1.0.3

- Keep native browser content aligned when panes move without changing size, including repeated moves above, below, left, and right.
- Recompute overlay coverage when browser geometry changes.
- Remove transparency holes when browser tabs are hidden, empty, or failed, so normal workspace backgrounds return.
- Avoid redundant native position updates and stop frame tracking for hidden tabs.

## 1.0.2

- Integrated live native browser surfaces with shared overlay geometry, z-order changes, and forwarded interaction while overlays are present.
