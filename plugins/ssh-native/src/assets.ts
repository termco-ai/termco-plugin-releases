import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function pluginAssetPath(...segments: string[]): string {
  const suffix = segments.map(encodeURIComponent).join("/");
  const compiled = fileURLToPath(new URL(`./assets/${suffix}`, import.meta.url));
  const source = fileURLToPath(new URL(`../assets/${suffix}`, import.meta.url));
  return existsSync(compiled) ? compiled : source;
}
