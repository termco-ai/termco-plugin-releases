import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pluginsRoot = join(root, "plugins");
const profile = JSON.parse(
  await fs.readFile(join(root, "profiles", "default", "profile.json"), "utf8"),
);
const protectedIds = new Set([
  "boot-diagnostics-native",
  "plugin-manager-native",
  "safe-recovery-native",
  "settings-native",
  "ui-shell-native",
  "updater-native",
  "workspace-shell-native",
]);
const failures = [];
let released = 0;
for (const row of profile.plugins) {
  if (protectedIds.has(row.id)) continue;
  released += 1;
  const pluginRoot = join(pluginsRoot, row.id);
  for (const required of [
    "termco-plugin.json",
    "package.json",
    "README.md",
    "AGENTS.md",
    "src",
  ]) {
    try {
      await fs.access(join(pluginRoot, required));
    } catch {
      failures.push(`${row.id}: missing ${required}`);
    }
  }
  try {
    const manifest = JSON.parse(
      await fs.readFile(join(pluginRoot, "termco-plugin.json"), "utf8"),
    );
    if (manifest.id !== row.id) failures.push(`${row.id}: manifest id differs`);
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      failures.push(`${row.id}: version must use major.minor.patch`);
    }
    if (!manifest.entrypoints || Object.keys(manifest.entrypoints).length === 0) {
      failures.push(`${row.id}: no runtime entrypoint`);
    }
  } catch (error) {
    failures.push(`${row.id}: cannot read manifest (${error.message})`);
  }
}
if (failures.length > 0) {
  throw new Error(`plugin repository validation failed:\n${failures.join("\n")}`);
}
console.log(`Validated ${released} released plugins.`);
