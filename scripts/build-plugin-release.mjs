import { createHash, createPrivateKey, sign } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { zipSync } from "fflate";

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROTECTED_PLUGIN_IDS = new Set([
  "boot-diagnostics-native",
  "plugin-manager-native",
  "safe-recovery-native",
  "settings-native",
  "ui-shell-native",
  "updater-native",
  "workspace-shell-native",
]);
const STABLE_VERSION = /^\d+\.\d+\.\d+$/;
const PLUGIN_ID = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const FIXED_ZIP_DATE = new Date("1980-01-01T00:00:00.000Z");
const COMPILER_ONLY_DEPENDENCIES = new Set([
  "electron",
  "@testing-library/jest-dom",
  "@testing-library/react",
]);

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("value is not JSON serializable");
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  return `{${Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

export function compareStableVersions(left, right) {
  if (!STABLE_VERSION.test(left) || !STABLE_VERSION.test(right)) {
    throw new Error("plugin versions must use stable major.minor.patch values");
  }
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

export function changedPluginIds(paths) {
  return [
    ...new Set(
      paths.flatMap((path) => {
        const normalized = path.replaceAll("\\", "/");
        const match = normalized.match(/^plugins\/([^/]+)\//);
        return match ? [match[1]] : [];
      }),
    ),
  ].sort();
}

function isReleaseRelevantPluginPath(path) {
  const normalized = path.replaceAll("\\", "/");
  const relativePath = normalized.replace(/^plugins\/[^/]+\//, "");
  return !(
    relativePath === "AGENTS.md" ||
    relativePath === "README.md" ||
    relativePath === "baseline-test-equivalence.json" ||
    relativePath.startsWith("src/baselineParity/") ||
    relativePath.includes("/fixtures/") ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relativePath)
  );
}

export function releaseRelevantPluginIds(paths) {
  return changedPluginIds(paths.filter(isReleaseRelevantPluginPath));
}

export function isProtectedPlugin(pluginId) {
  return PROTECTED_PLUGIN_IDS.has(pluginId) || pluginId.endsWith("-base");
}

/** Automatic plugin publishing must never split a mixed host/plugin change.
 * Documentation and verification-only changes do not alter either runtime. */
export function requiresApplicationRelease(paths) {
  return paths.some((path) => {
    const normalized = path.replaceAll("\\", "/");
    const plugin = normalized.match(/^plugins\/([^/]+)\//);
    if (plugin) {
      return isReleaseRelevantPluginPath(normalized) && isProtectedPlugin(plugin[1]);
    }
    if (
      normalized.startsWith("docs/") ||
      normalized.startsWith("test/") ||
      normalized.startsWith("e2e/") ||
      normalized.startsWith(".github/") ||
      /(^|\/)(?:README|AGENTS|CONTRIBUTING|SECURITY|TERMCO)\.md$/i.test(normalized) ||
      /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized) ||
      normalized === "scripts/build-plugin-release.mjs" ||
      normalized === "scripts/build-plugin-release.test.mjs" ||
      normalized === "scripts/verify-packaged.mjs"
    ) {
      return false;
    }
    return true;
  });
}

function git(repositoryRoot, args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function changedPaths(repositoryRoot, base) {
  if (!base) throw new Error("--changed-from is required when --plugins is omitted");
  return git(repositoryRoot, ["diff", "--name-only", `${base}..HEAD`])
    .split("\n")
    .filter(Boolean);
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function inside(root, candidate) {
  const path = relative(root, candidate);
  return path !== ".." && !path.startsWith(`..${sep}`) && !path.startsWith("/");
}

async function pluginFiles(root, directory = root, result = {}) {
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    if ([".git", ".termco-cache", "node_modules"].includes(entry.name)) continue;
    // AGENTS.md is source-repository guidance for maintainers. Runtime agents
    // learn plugin capabilities from manifests, registrations, tool metadata,
    // and prompts, so this file must not become installed application data.
    if (entry.isFile() && entry.name === "AGENTS.md") continue;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`${basename(root)} contains a symbolic link: ${relative(root, path)}`);
    }
    if (entry.isDirectory()) {
      await pluginFiles(root, path, result);
      continue;
    }
    if (!entry.isFile()) continue;
    const archivePath = `plugins/${basename(root)}/${relative(root, path).split(sep).join("/")}`;
    result[archivePath] = [new Uint8Array(await fs.readFile(path)), { mtime: FIXED_ZIP_DATE }];
  }
  return result;
}

async function manifestAtRevision(repositoryRoot, revision, pluginId) {
  if (!revision) return null;
  try {
    return JSON.parse(
      git(repositoryRoot, ["show", `${revision}:plugins/${pluginId}/termco-plugin.json`]),
    );
  } catch {
    return null;
  }
}

function normalizePrivateKey(value) {
  return value.includes("\\n") ? value.replaceAll("\\n", "\n") : value;
}

export function changelogNotes(markdown, version) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const collected = [];
  let collecting = false;
  for (const line of lines) {
    const heading = line.match(
      /^##\s+\[?(\d+\.\d+\.\d+)\]?(?:\s+-[^\r\n]*)?\s*$/,
    );
    if (heading) {
      if (collecting) break;
      collecting = heading[1] === version;
      continue;
    }
    if (collecting) collected.push(line);
  }
  const value = collected.join("\n").trim();
  return value || null;
}

async function notesFor(pluginRoot, pluginId, manifest, notes) {
  const configured = notes?.[pluginId];
  if (typeof configured === "string") return configured;
  try {
    const changelog = await fs.readFile(join(pluginRoot, "CHANGELOG.md"), "utf8");
    const current = changelogNotes(changelog, manifest.version);
    if (current) return current;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return manifest.description;
}

async function shippedApplicationDependencies(repositoryRoot, rootPackage) {
  try {
    const configured = await readJson(
      join(repositoryRoot, "host-runtime-packages.json"),
    );
    if (
      !Array.isArray(configured.packages) ||
      configured.packages.some((name) => typeof name !== "string")
    ) {
      throw new Error("host-runtime-packages.json must contain a packages array");
    }
    return new Set(configured.packages);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return new Set([
    ...Object.keys(rootPackage.dependencies ?? {}),
    ...Object.keys(rootPackage.optionalDependencies ?? {}),
  ]);
}

async function assertShippedDependencies(repositoryRoot, pluginId, manifest, shippedRootDependencies) {
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    if (
      dependency === "@termco/kernel" ||
      dependency === "@termco/ui" ||
      dependency === "@termco/react/jsx-runtime" ||
      COMPILER_ONLY_DEPENDENCIES.has(dependency) ||
      shippedRootDependencies.has(dependency)
    ) {
      continue;
    }
    if (dependency.startsWith("@termco/") && dependency.endsWith("-base")) {
      const packageName = dependency.slice("@termco/".length);
      try {
        await fs.access(join(repositoryRoot, "plugins", packageName, "package.json"));
        continue;
      } catch {
        // Fall through to the actionable error below.
      }
    }
    throw new Error(
      `${pluginId} depends on ${dependency}, which is not in the shipped application baseline`,
    );
  }
}

export async function buildPluginRelease(options) {
  const repositoryRoot = resolve(options.repositoryRoot ?? SCRIPT_ROOT);
  const outputRoot = resolve(repositoryRoot, options.outputRoot);
  if (!inside(repositoryRoot, outputRoot) || outputRoot === repositoryRoot) {
    throw new Error("plugin release output must be a child of the repository root");
  }
  try {
    const existing = await fs.readdir(outputRoot);
    if (existing.length > 0) {
      throw new Error(`plugin release output is not empty: ${outputRoot}`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await fs.mkdir(outputRoot, { recursive: true });

  const rootPackage = await readJson(join(repositoryRoot, "package.json"));
  const shippedRootDependencies = await shippedApplicationDependencies(
    repositoryRoot,
    rootPackage,
  );
  const explicitIds = options.pluginIds?.filter(Boolean) ?? [];
  const automaticPaths = explicitIds.length > 0
    ? []
    : changedPaths(repositoryRoot, options.changedFrom);
  if (!options.pluginRepository && requiresApplicationRelease(automaticPaths)) {
    return null;
  }
  const changedIds = new Set(releaseRelevantPluginIds(automaticPaths));
  const discoveredIds = options.fullSnapshot
    ? (await readJson(join(repositoryRoot, "profiles", "default", "profile.json")))
        .plugins.map((row) => row.id)
    : explicitIds.length > 0
      ? [...new Set(explicitIds)].sort()
      : [...changedIds];
  const pluginIds = discoveredIds.filter((id) => !isProtectedPlugin(id));
  if (pluginIds.length === 0) return null;
  const notes = options.notesFile ? await readJson(options.notesFile) : undefined;
  const files = {};
  const plugins = [];
  const pluginArtifacts = [];
  for (const pluginId of pluginIds) {
    if (!PLUGIN_ID.test(pluginId)) throw new Error(`invalid plugin id: ${pluginId}`);
    const pluginRoot = join(repositoryRoot, "plugins", pluginId);
    let manifest;
    try {
      manifest = await readJson(join(pluginRoot, "termco-plugin.json"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (manifest.id !== pluginId || !manifest.entrypoints) {
      throw new Error(`${pluginId} is not an executable plugin with matching identity`);
    }
    if (!STABLE_VERSION.test(manifest.version)) {
      throw new Error(`${pluginId} must use a stable major.minor.patch version`);
    }
    const previous = await manifestAtRevision(
      repositoryRoot,
      options.changedFrom,
      pluginId,
    );
    if (
      previous?.version &&
      (!options.fullSnapshot || changedIds.has(pluginId)) &&
      compareStableVersions(manifest.version, previous.version) <= 0
    ) {
      throw new Error(
        `${pluginId} changed without a stable version increase (${previous.version} -> ${manifest.version})`,
      );
    }
    await assertShippedDependencies(
      repositoryRoot,
      pluginId,
      manifest,
      shippedRootDependencies,
    );
    const sourceFiles = await pluginFiles(pluginRoot);
    Object.assign(files, sourceFiles);
    const plugin = {
      id: pluginId,
      name: manifest.name,
      version: manifest.version,
      notes: await notesFor(pluginRoot, pluginId, manifest, notes),
    };
    const artifactBytes = zipSync(sourceFiles, { level: 9 });
    pluginArtifacts.push({
      pluginId,
      assetName: `${pluginId}-${manifest.version}.zip`,
      bytes: artifactBytes,
    });
    plugins.push(plugin);
  }

  if (plugins.length === 0) return null;

  const archiveName = `${options.releaseId}.zip`;
  const archive = zipSync(files, { level: 9 });
  const publishedAt = options.publishedAt ?? new Date().toISOString();
  const application = {
    minVersion: options.minApplicationVersion,
    ...(options.maxApplicationVersionExclusive
      ? { maxVersionExclusive: options.maxApplicationVersionExclusive }
      : {}),
  };
  const revokedReleaseIds = options.revokedReleaseIds ?? [];
  const unsigned = {
    schemaVersion: 1,
    releaseId: options.releaseId,
    channel: "stable",
    publishedAt,
    application,
    archive: {
      assetName: archiveName,
      sha256: createHash("sha256").update(archive).digest("hex"),
      size: archive.byteLength,
    },
    plugins,
    revokedReleaseIds,
    rolloutPercentage: 100,
  };
  const privateKey = createPrivateKey(normalizePrivateKey(options.privateKey));
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("plugin release private key must be Ed25519");
  }
  const signature = sign(
    null,
    Buffer.from(canonicalJson(unsigned), "utf8"),
    privateKey,
  ).toString("base64");
  const manifest = {
    ...unsigned,
    signature: {
      algorithm: "ed25519",
      keyId: options.keyId,
      value: signature,
    },
  };
  const artifactByPluginId = new Map(
    pluginArtifacts.map((artifact) => [artifact.pluginId, artifact]),
  );
  const unsignedCatalog = {
    schemaVersion: 2,
    releaseId: options.releaseId,
    channel: "stable",
    publishedAt,
    application,
    plugins: plugins.map((plugin) => {
      const artifact = artifactByPluginId.get(plugin.id);
      if (!artifact) throw new Error(`missing release artifact for ${plugin.id}`);
      return {
        ...plugin,
        artifact: {
          assetName: artifact.assetName,
          sha256: createHash("sha256").update(artifact.bytes).digest("hex"),
          size: artifact.bytes.byteLength,
        },
      };
    }),
    revokedReleaseIds,
    rolloutPercentage: 100,
  };
  const catalog = {
    ...unsignedCatalog,
    signature: {
      algorithm: "ed25519",
      keyId: options.keyId,
      value: sign(
        null,
        Buffer.from(canonicalJson(unsignedCatalog), "utf8"),
        privateKey,
      ).toString("base64"),
    },
  };
  await Promise.all([
    fs.writeFile(join(outputRoot, archiveName), archive, { flag: "wx" }),
    fs.writeFile(
      join(outputRoot, "termco-plugin-release.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: "wx" },
    ),
    fs.writeFile(
      join(outputRoot, "termco-plugin-catalog-v2.json"),
      `${JSON.stringify(catalog, null, 2)}\n`,
      { flag: "wx" },
    ),
    ...pluginArtifacts.map((artifact) =>
      fs.writeFile(join(outputRoot, artifact.assetName), artifact.bytes, {
        flag: "wx",
      }),
    ),
  ]);
  return { manifest, catalog, outputRoot };
}

async function main() {
  const privateKey = process.env.TERMCO_PLUGIN_RELEASE_PRIVATE_KEY;
  const keyId = process.env.TERMCO_PLUGIN_RELEASE_KEY_ID;
  if (!privateKey || !keyId) {
    throw new Error(
      "TERMCO_PLUGIN_RELEASE_PRIVATE_KEY and TERMCO_PLUGIN_RELEASE_KEY_ID are required",
    );
  }
  const releaseId = argument("release-id");
  const outputRoot = argument("output", "plugin-release-artifacts");
  const minApplicationVersion = argument("min-app");
  if (!releaseId || !minApplicationVersion) {
    throw new Error("--release-id and --min-app are required");
  }
  const explicitPlugins = argument("plugins");
  const result = await buildPluginRelease({
    repositoryRoot: SCRIPT_ROOT,
    outputRoot,
    releaseId,
    minApplicationVersion,
    maxApplicationVersionExclusive: argument("max-app"),
    changedFrom: argument("changed-from"),
    pluginIds: explicitPlugins?.split(",").map((value) => value.trim()),
    fullSnapshot: process.argv.includes("--all"),
    pluginRepository: process.argv.includes("--plugin-repository"),
    notesFile: argument("notes"),
    revokedReleaseIds: (argument("revoked", "") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    privateKey,
    keyId,
  });
  console.log(
    result
      ? `Built signed plugin release ${result.manifest.releaseId}: ${result.manifest.plugins.map(({ id, version }) => `${id}@${version}`).join(", ")}`
      : "No eligible plugin changes found; no plugin release was built.",
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
