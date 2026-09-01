/**
 * Muted, small-caps field label for the agents manager — same markup as the
 * settings window's Label so the moved editor dialogs keep their look.
 */
export function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </span>
  );
}
