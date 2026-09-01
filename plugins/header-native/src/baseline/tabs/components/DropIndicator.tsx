/**
 * Thin vertical bar rendered in the tab strip at the insertion gap while a tab
 * is being dragged, marking where the dropped tab will land.
 */

/** Drop-target marker for the tab strip. */
export function DropIndicator() {
  return (
    <span
      aria-hidden
      className="my-0.5 w-0.5 shrink-0 self-stretch rounded-full bg-primary"
    />
  );
}
