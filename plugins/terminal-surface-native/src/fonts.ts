const CANDIDATES = [
  "JetBrainsMono Nerd Font",
  "JetBrainsMono Nerd Font Mono",
  "FiraCode Nerd Font",
  "MesloLGS NF",
  "Hack Nerd Font",
];
const FALLBACK = '"JetBrains Mono", SFMono-Regular, Menlo, monospace';
let detected: string | null = null;
let loading: Promise<void> | null = null;

export function ensureMonoFontsLoaded(): Promise<void> {
  loading ??= typeof document === "undefined" || !document.fonts?.load
    ? Promise.resolve()
    : Promise.allSettled([
        document.fonts.load('400 14px "JetBrains Mono"'),
        document.fonts.load('700 14px "JetBrains Mono"'),
      ]).then(() => undefined);
  return loading;
}

function detectedFamily(): string {
  if (detected) return detected;
  detected = CANDIDATES.find((font) => document.fonts?.check(`12px "${font}"`))
    ? `"${CANDIDATES.find((font) => document.fonts?.check(`12px "${font}"`))}", ${FALLBACK}`
    : FALLBACK;
  return detected;
}

export function resolveFontFamily(input: string): string {
  const name = input.trim();
  if (!name) return detectedFamily();
  const head = name.includes(",") ? name : `"${name.replace(/['"]/g, "")}"`;
  return `${head}, ${FALLBACK}`;
}
