import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import {
  sanitizeReplayFixture,
  verifyReplayFixture,
  type ReplayFixtureVerificationOptions,
} from "./fixtureWorkflow";
import { createReplayInferenceAdapter, type ReplayScenarioSource } from "./replay";

interface ScenarioManifest {
  readonly schemaVersion: 1;
  readonly command: readonly string[];
  readonly guards?: ReplayFixtureVerificationOptions;
  readonly snapshot?: {
    readonly actual: string;
    readonly expected: string;
  };
}

function cliError(message: string): Error & { readonly code: string } {
  return Object.assign(new Error(message), {
    name: "ReplayFixtureCliError",
    code: "REPLAY_FIXTURE_CLI_ERROR",
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as { readonly code?: unknown }).code === "ENOENT") return false;
    throw error;
  }
}

function parseJsonObject(source: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (cause) {
    throw cliError(`${label} is not valid JSON: ${String(cause)}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw cliError(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function parseManifest(source: string): ScenarioManifest {
  const value = parseJsonObject(source, "scenario.json");
  const allowed = new Set(["schemaVersion", "command", "guards", "snapshot"]);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw cliError(`scenario.json has unknown field ${unknown}`);
  if (value.schemaVersion !== 1) {
    throw cliError("scenario.json schemaVersion must be 1");
  }
  if (
    !Array.isArray(value.command) ||
    value.command.length === 0 ||
    value.command.some((entry) => typeof entry !== "string" || entry.length === 0)
  ) {
    throw cliError("scenario.json command must be a non-empty string array");
  }
  if (value.guards !== undefined && (!value.guards || typeof value.guards !== "object" || Array.isArray(value.guards))) {
    throw cliError("scenario.json guards must be an object");
  }
  if (value.snapshot !== undefined) {
    if (!value.snapshot || typeof value.snapshot !== "object" || Array.isArray(value.snapshot)) {
      throw cliError("scenario.json snapshot must be an object");
    }
    const snapshot = value.snapshot as Record<string, unknown>;
    if (typeof snapshot.actual !== "string" || typeof snapshot.expected !== "string") {
      throw cliError("scenario.json snapshot requires actual and expected paths");
    }
  }
  return value as unknown as ScenarioManifest;
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalJson(child)]),
  );
}

function scenarioPath(directory: string, requested: string): string {
  if (isAbsolute(requested)) {
    throw cliError("scenario snapshot paths must be relative");
  }
  const target = resolve(directory, requested);
  const boundary = relative(directory, target);
  if (boundary === ".." || boundary.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw cliError("scenario snapshot paths must stay inside the scenario directory");
  }
  return target;
}

async function digest(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function keylessEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|OPENAI|OPENROUTER|ANTHROPIC)/i.test(key)
  ));
}

async function runCommand(
  command: readonly string[],
  scenarioDirectory: string,
  refresh: boolean,
): Promise<void> {
  const [program, ...args] = command;
  if (!program) throw cliError("scenario command is empty");
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(program, args, {
      cwd: process.cwd(),
      env: {
        ...keylessEnvironment(),
        TERMCO_REPLAY_SCENARIO_DIR: scenarioDirectory,
        ...(refresh ? { TERMCO_REPLAY_REFRESH: "1" } : {}),
      },
      stdio: "inherit",
      shell: false,
    });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(cliError(
        `scenario command failed (${signal ? `signal ${signal}` : `exit ${String(code)}`})`,
      ));
    });
  });
}

export async function recordFixture(
  sourcePath: string,
  scenarioDirectory: string,
): Promise<void> {
  const source = resolve(sourcePath);
  const targetDirectory = resolve(scenarioDirectory);
  const target = join(targetDirectory, "session.jsonl");
  if (await exists(target)) {
    throw cliError(`refusing to overwrite existing fixture ${target}`);
  }
  const sanitized = sanitizeReplayFixture(await readFile(source, "utf8"));
  await mkdir(targetDirectory, { recursive: true });
  await writeFile(target, `${sanitized.sessionJsonl}\n`, { flag: "wx" });
  await writeFile(
    join(targetDirectory, "sanitization-review.json"),
    `${JSON.stringify(sanitized.review, null, 2)}\n`,
    { flag: "wx" },
  );
}

async function loadSources(scenarioDirectory: string): Promise<ReplayScenarioSource[]> {
  const names = (await readdir(scenarioDirectory))
    .filter((name) => /^session(?:\.[A-Za-z0-9_-]+)?\.jsonl$/.test(name))
    .sort();
  if (!names.includes("session.jsonl")) {
    throw cliError("scenario directory has no session.jsonl");
  }
  const overridePath = join(scenarioDirectory, "replay.override.json");
  const overrideJson = await exists(overridePath)
    ? await readFile(overridePath, "utf8")
    : undefined;
  return Promise.all(names.map(async (name) => ({
    scenarioId: basename(name, ".jsonl"),
    sessionJsonl: await readFile(join(scenarioDirectory, name), "utf8"),
    ...(name === "session.jsonl" && overrideJson !== undefined
      ? { overrideJson }
      : {}),
  })));
}

export async function verifyScenarioFixtures(
  scenarioDirectory: string,
  guards: ReplayFixtureVerificationOptions = {},
): Promise<readonly ReturnType<typeof verifyReplayFixture>[]> {
  const directory = resolve(scenarioDirectory);
  const sources = await loadSources(directory);
  const reports = sources.map((source, index) =>
    verifyReplayFixture(source.sessionJsonl, index === 0 ? guards : {})
  );
  createReplayInferenceAdapter(sources);
  return reports;
}

async function scenarioManifest(directory: string): Promise<ScenarioManifest> {
  const path = join(directory, "scenario.json");
  if (!await exists(path)) throw cliError(`scenario manifest is missing: ${path}`);
  return parseManifest(await readFile(path, "utf8"));
}

async function executeScenario(
  scenarioDirectory: string,
  mode: "replay" | "verify" | "refresh",
): Promise<void> {
  const directory = resolve(scenarioDirectory);
  const manifest = await scenarioManifest(directory);
  const fixturePath = join(directory, "session.jsonl");
  await verifyScenarioFixtures(directory, manifest.guards ?? {});
  const before = await digest(fixturePath);
  await runCommand(manifest.command, directory, mode === "refresh");
  await verifyScenarioFixtures(directory, manifest.guards ?? {});
  if (await digest(fixturePath) !== before) {
    throw cliError("scenario execution mutated the canonical replay fixture");
  }
  if (mode === "replay") return;
  const snapshot = manifest.snapshot;
  if (!snapshot) throw cliError(`${mode} requires scenario.json snapshot paths`);
  const actual = scenarioPath(directory, snapshot.actual);
  const expected = scenarioPath(directory, snapshot.expected);
  const actualValue = canonicalJson(parseJsonObject(await readFile(actual, "utf8"), "actual snapshot"));
  if (mode === "refresh") {
    await mkdir(dirname(expected), { recursive: true });
    await copyFile(actual, expected);
    return;
  }
  const expectedValue = canonicalJson(parseJsonObject(
    await readFile(expected, "utf8"),
    "expected snapshot",
  ));
  if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
    throw cliError("actual semantic snapshot differs from expected snapshot");
  }
}

function usage(): string {
  return [
    "Usage:",
    "  replay-fixture record <source-session.jsonl> <scenario-dir>",
    "  replay-fixture replay <scenario-dir>",
    "  replay-fixture verify <scenario-dir>",
    "  replay-fixture refresh <scenario-dir>",
  ].join("\n");
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const [command, first, second, ...rest] = args;
  if (rest.length > 0) throw cliError(usage());
  switch (command) {
    case "record":
      if (!first || !second) throw cliError(usage());
      await recordFixture(first, second);
      return;
    case "replay":
    case "verify":
    case "refresh":
      if (!first || second) throw cliError(usage());
      await executeScenario(first, command);
      return;
    default:
      throw cliError(usage());
  }
}
