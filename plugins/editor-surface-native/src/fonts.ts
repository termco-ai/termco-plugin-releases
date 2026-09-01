const CANDIDATES = ["JetBrainsMono Nerd Font", "FiraCode Nerd Font", "MesloLGS NF", "Hack Nerd Font"];
const FALLBACK = '"JetBrains Mono", SFMono-Regular, Menlo, monospace';
let detected: string | null = null;
export function detectMonoFontFamily(): string {
  if (detected) return detected;
  const match = CANDIDATES.find((font) => document.fonts?.check(`12px "${font}"`));
  detected = match ? `"${match}", ${FALLBACK}` : FALLBACK;
  return detected;
}
