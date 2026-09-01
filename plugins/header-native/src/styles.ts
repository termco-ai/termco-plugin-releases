export const button = {
  display: "grid", placeItems: "center", width: 28, height: 28, flexShrink: 0,
  border: 0, borderRadius: 7, background: "transparent",
  color: "var(--muted-foreground)", cursor: "pointer", padding: 0,
} as const;

export const activeButton = {
  ...button,
  background: "color-mix(in srgb, var(--primary) 12%, transparent)",
  color: "var(--primary)",
} as const;

export const menu = {
  position: "absolute", zIndex: 100, top: 34, minWidth: 250, maxHeight: "65vh",
  overflow: "auto", border: "1px solid var(--border)", borderRadius: 9,
  background: "var(--popover, var(--background))", color: "var(--foreground)",
  boxShadow: "0 12px 34px rgba(0,0,0,.24)", padding: 6,
} as const;

export const menuButton = {
  display: "flex", width: "100%", alignItems: "center", gap: 8, border: 0,
  borderRadius: 6, background: "transparent", color: "var(--foreground)",
  cursor: "pointer", padding: "7px 9px", textAlign: "left", fontSize: 12,
} as const;

export const input = {
  boxSizing: "border-box", width: "100%", height: 30,
  border: "1px solid var(--border)", borderRadius: 7,
  background: "var(--background)", color: "var(--foreground)",
  padding: "5px 9px", outline: "none", fontSize: 12,
} as const;

export const muted = { color: "var(--muted-foreground)", fontSize: 11 } as const;
