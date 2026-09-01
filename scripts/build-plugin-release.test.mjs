import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { unzipSync } from "fflate";
import { buildPluginRelease, canonicalJson } from "./build-plugin-release.mjs";

test("release archives keep runtime source but omit AGENTS.md", async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), "termco-plugin-release-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const pluginRoot = join(root, "plugins", "feature-native");
  await fs.mkdir(join(pluginRoot, "src"), { recursive: true });
  await Promise.all([
    fs.writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "release-test", private: true, dependencies: {} }),
    ),
    fs.writeFile(join(pluginRoot, "AGENTS.md"), "# Maintainer-only context\n"),
    fs.writeFile(join(pluginRoot, "README.md"), "# Feature\n"),
    fs.writeFile(
      join(pluginRoot, "package.json"),
      JSON.stringify({ name: "@termco/plugin-feature-native", private: true }),
    ),
    fs.writeFile(
      join(pluginRoot, "termco-plugin.json"),
      JSON.stringify({
        schemaVersion: 3,
        id: "feature-native",
        name: "Feature",
        description: "A test feature.",
        category: "Test",
        version: "1.0.0",
        entrypoints: { renderer: "src/renderer.ts" },
        dependencies: {},
      }),
    ),
    fs.writeFile(join(pluginRoot, "src", "renderer.ts"), "export default {};\n"),
  ]);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const result = await buildPluginRelease({
    repositoryRoot: root,
    outputRoot: "artifacts",
    releaseId: "plugins-0.9.0.test",
    minApplicationVersion: "0.9.0",
    pluginIds: ["feature-native"],
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    keyId: "test-key",
    publishedAt: "2026-08-31T00:00:00.000Z",
  });
  assert.ok(result);
  const archive = await fs.readFile(
    join(root, "artifacts", result.manifest.archive.assetName),
  );
  const entries = Object.keys(unzipSync(archive));
  assert.ok(entries.includes("plugins/feature-native/README.md"));
  assert.ok(entries.includes("plugins/feature-native/src/renderer.ts"));
  assert.ok(!entries.includes("plugins/feature-native/AGENTS.md"));

  const catalog = JSON.parse(
    await fs.readFile(join(root, "artifacts", "termco-plugin-catalog-v2.json"), "utf8"),
  );
  assert.equal(catalog.schemaVersion, 2);
  assert.equal(catalog.plugins.length, 1);
  assert.equal(catalog.plugins[0].artifact.assetName, "feature-native-1.0.0.zip");
  const pluginArchive = await fs.readFile(
    join(root, "artifacts", catalog.plugins[0].artifact.assetName),
  );
  assert.equal(pluginArchive.byteLength, catalog.plugins[0].artifact.size);
  assert.deepEqual(Object.keys(unzipSync(pluginArchive)).sort(), entries.sort());
  const { signature, ...signedCatalog } = catalog;
  assert.equal(
    verify(
      null,
      Buffer.from(canonicalJson(signedCatalog), "utf8"),
      publicKey,
      Buffer.from(signature.value, "base64"),
    ),
    true,
  );
});
