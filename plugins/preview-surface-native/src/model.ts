import type { BrowserChord } from "@termco/browser-base";
import type {
  KeyBinding,
  ShortcutRegistrySnapshot,
} from "@termco/shortcuts-base";

export const PORT_PRESETS = [
  [5173, "Vite", "vite, sveltekit"],
  [5174, "Vite (alt)", "second vite instance"],
  [3000, "Next.js", "next, express, rails"],
  [3001, "Next.js (alt)", "second next instance"],
  [4173, "Vite preview", "vite preview"],
  [4200, "Angular", "angular cli"],
  [4321, "Astro", "astro"],
  [5500, "Live Server", "vscode live server"],
  [6006, "Storybook", "storybook"],
  [8080, "Webpack", "webpack, vue cli"],
  [8081, "Metro", "react native metro"],
  [8000, "Django / FastAPI", "django, fastapi"],
  [8888, "Jupyter", "jupyter notebook"],
  [5000, "Flask", "flask"],
  [7860, "Gradio", "gradio"],
  [11434, "Ollama", "ollama api"],
] as const;

export function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^localhost(:|\/|$)/i.test(value)) return `http://${value}`;
  if (/^\d{1,3}(\.\d{1,3}){3}(:|\/|$)/.test(value)) return `http://${value}`;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(value)) return `https://${value}`;
  return value;
}

export function isLocalUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "[::1]" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

export async function probeUrl(url: string): Promise<boolean> {
  try {
    await fetch(url, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: AbortSignal.timeout(900),
    });
    return true;
  } catch {
    return false;
  }
}

function chord(binding: KeyBinding): BrowserChord {
  return {
    key: binding.key,
    control: binding.ctrl ?? false,
    meta: binding.meta ?? false,
    shift: binding.shift ?? false,
    alt: binding.alt ?? false,
  };
}

export function chordsFromSnapshot(
  snapshot: ShortcutRegistrySnapshot,
): BrowserChord[] {
  const result: BrowserChord[] = [];
  const seen = new Set<string>();
  const add = (binding: KeyBinding) => {
    if (!binding.ctrl && !binding.meta) return;
    const value = chord(binding);
    const key = `${value.key.toLowerCase()}:${+!!value.control}${+!!value.meta}${+!!value.shift}${+!!value.alt}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  };
  for (const shortcut of snapshot.shortcuts) {
    const bindings =
      snapshot.overrides[shortcut.id] ?? shortcut.defaultBindings;
    for (const binding of bindings) {
      if (shortcut.id === "tab.selectByIndex") {
        for (let index = 1; index <= 9; index += 1)
          add({ ...binding, key: String(index) });
      } else add(binding);
    }
  }
  return result;
}

export function rectsOverlap(
  left: { left: number; top: number; right: number; bottom: number },
  right: { left: number; top: number; right: number; bottom: number },
): boolean {
  return (
    left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top
  );
}

export function rectsEqual(
  left: { x: number; y: number; width: number; height: number } | null,
  right: { x: number; y: number; width: number; height: number } | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

export function hasArea(rect: { width: number; height: number }): boolean {
  return rect.width > 0 && rect.height > 0;
}
