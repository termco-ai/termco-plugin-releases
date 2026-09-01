/**
 * File-icon associations, shard 5 of 6 (keys "rollup" through "vanilla-extract").
 *
 * One slice of the full icon map. Each key is an icon-file basename; the value
 * lists the language ids, file extensions, and file names that map to it.
 * Merged with the sibling shards in `../map.ts`. Do not reorder relative to the
 * other shards: later entries win when two icons claim the same token.
 *
 * @keep-sorted
 */
import type { FileIconEntry } from "../types";

export const fileIcons_r_v: Record<string, FileIconEntry> = {
  rollup: {
    fileNames: [
      "rollup.config.js",
      "rollup.config.mjs",
      "rollup.config.ts",
      "rollup-config.js",
      "rollup-config.mjs",
      "rollup-config.ts",
      "rollup.config.common.js",
      "rollup.config.common.mjs",
      "rollup.config.common.ts",
      "rollup.config.base.js",
      "rollup.config.base.mjs",
      "rollup.config.base.ts",
      "rollup.config.prod.js",
      "rollup.config.prod.mjs",
      "rollup.config.prod.ts",
      "rollup.config.dev.js",
      "rollup.config.dev.mjs",
      "rollup.config.dev.ts",
      "rollup.config.prod.vendor.js",
      "rollup.config.prod.vendor.mjs",
      "rollup.config.prod.vendor.ts",
    ],
  },
  rproj: {
    fileExtensions: ["rproj"],
  },
  rsml: {
    fileExtensions: ["rsml"],
  },
  "ruby-gem-lock": {
    fileNames: ["gemfile.lock"],
  },
  "ruby-gem": {
    fileNames: ["gemfile"],
  },
  ruby: {
    languageIds: ["ruby"],
    fileExtensions: ["rb", "erb", "rbs"],
    fileNames: [".ruby-version"],
  },
  ruff: {
    fileNames: ["ruff.toml", ".ruff.toml"],
  },
  "rust-config": {
    fileNames: [
      "rustfmt.toml",
      ".rustfmt.toml",
      "rust-toolchain.toml",
      "clippy.toml",
    ],
  },
  rust: {
    languageIds: ["rust"],
    fileExtensions: ["rs", "ron"],
  },
  salesforce: {
    fileExtensions: ["cls"],
  },
  sass: {
    languageIds: ["sass", "scss"],
    fileExtensions: ["scss", "sass"],
  },
  scala: {
    languageIds: ["scala"],
    fileExtensions: ["scala", "sc"],
  },
  scheme: {
    fileExtensions: ["scm"],
  },
  search: {
    languageIds: ["search-result"],
    fileExtensions: ["code-search"],
  },
  security: {
    fileNames: ["security.md", "security.txt", "security"],
  },
  "semantic-release": {
    fileNames: [
      ".releaserc",
      ".releaserc.yaml",
      ".releaserc.yml",
      ".releaserc.json",
      ".releaserc.js",
      ".releaserc.cjs",
      "release.config.js",
      "release.config.cjs",
    ],
  },
  "semgrep-ignore": {
    fileNames: [".semgrepignore"],
  },
  semgrep: {
    fileNames: ["semgrep.yml"],
  },
  sentry: {
    fileNames: [".sentryclirc"],
  },
  serverless: {
    fileNames: [
      "serverless.yml",
      "serverless.yaml",
      "serverless.json",
      "serverless.js",
      "serverless.ts",
    ],
  },
  shader: {
    languageIds: ["hlsl", "glsl", "wgsl"],
    fileExtensions: [
      "glsl",
      "vert",
      "tesc",
      "tese",
      "geom",
      "frag",
      "comp",
      "vert.glsl",
      "tesc.glsl",
      "tese.glsl",
      "geom.glsl",
      "frag.glsl",
      "comp.glsl",
      "vertex.glsl",
      "geometry.glsl",
      "fragment.glsl",
      "compute.glsl",
      "ts.glsl",
      "gs.glsl",
      "vs.glsl",
      "fs.glsl",
      "shader",
      "vertexshader",
      "fragmentshader",
      "geometryshader",
      "computeshader",
      "hlsl",
      "pixel.hlsl",
      "geometry.hlsl",
      "compute.hlsl",
      "tessellation.hlsl",
      "px.hlsl",
      "geom.hlsl",
      "comp.hlsl",
      "tess.hlsl",
      "wgsl",
    ],
  },
  sketch: {
    fileExtensions: ["sketch"],
  },
  slidesk: {
    languageIds: ["sdf"],
    fileExtensions: ["sdf", "sdt"],
  },
  snowpack: {
    fileNames: [
      "snowpack.config.js",
      "snowpack.config.cjs",
      "snowpack.config.mjs",
      "snowpack.config.ts",
      "snowpack.config.cts",
      "snowpack.config.mts",
      "snowpack.deps.json",
      "snowpack.config.json",
    ],
  },
  solidity: {
    languageIds: ["solidity"],
    fileExtensions: ["sol"],
  },
  "sonar-cloud": {
    fileNames: [
      "sonar-project.properties",
      ".sonarcloud.properties",
      "sonarcloud.yaml",
    ],
  },
  spwn: {
    fileExtensions: ["spwn"],
  },
  squirrel: {
    languageIds: ["squirrel"],
    fileExtensions: ["nut"],
  },
  stackblitz: {
    fileNames: [".stackblitzrc"],
  },
  stata: {
    fileExtensions: ["ado", "do", "dta"],
  },
  stencil: {
    fileNames: ["stencil.config.js", "stencil.config.ts"],
  },
  stitches: {
    fileNames: ["stitches.config.js", "stitches.config.ts"],
  },
  "storybook-svelte": {
    fileExtensions: ["story.svelte", "stories.svelte"],
  },
  "storybook-vue": {
    fileExtensions: ["story.vue", "stories.vue"],
  },
  storybook: {
    fileExtensions: [
      "stories.js",
      "stories.jsx",
      "stories.mdx",
      "story.js",
      "story.jsx",
      "stories.ts",
      "stories.tsx",
      "story.ts",
      "story.tsx",
      "story.mdx",
    ],
  },
  "stylelint-ignore": {
    fileNames: [".stylelintignore", ".stylelintcache"],
  },
  stylelint: {
    fileNames: [
      ".stylelintrc",
      "stylelint.config.js",
      "stylelint.config.ts",
      "stylelint.config.cjs",
      "stylelint.config.cts",
      "stylelint.config.mjs",
      "stylelint.config.mts",
      ".stylelintrc.json",
      ".stylelintrc.yaml",
      ".stylelintrc.yml",
      ".stylelintrc.js",
      ".stylelintrc.ts",
      ".stylelintrc.cjs",
      ".stylelintrc.cts",
      ".stylelintrc.mjs",
      ".stylelintrc.mts",
    ],
  },
  "stylua-ignore": {
    fileNames: [".styluaignore"],
  },
  stylua: {
    fileNames: ["stylua.toml"],
  },
  sublime: {
    fileExtensions: ["sublime-project", "sublime-workspace"],
  },
  "super-collider": {
    fileExtensions: ["sc", "scd"],
  },
  "svelte-config": {
    fileNames: [
      "svelte.config.js",
      "svelte.config.ts",
      "svelte.config.cjs",
      "svelte.config.mjs",
    ],
  },
  svelte: {
    languageIds: ["svelte"],
    fileExtensions: ["svelte"],
  },
  svg: {
    languageIds: ["svg"],
    fileExtensions: ["svg"],
  },
  swift: {
    languageIds: ["swift"],
    fileExtensions: ["swift"],
  },
  swiftformat: {
    fileNames: [".swiftformat"],
  },
  tailwind: {
    fileNames: [
      "tailwind.js",
      "tailwind.ts",
      "tailwind.config.js",
      "tailwind.config.cjs",
      "tailwind.config.mjs",
      "tailwind.config.ts",
      "tailwind.config.cts",
      "tailwind.config.mts",
    ],
  },
  taskfile: {
    fileNames: [
      "taskfile.yml",
      "taskfile.yaml",
      "taskfile.dist.yml",
      "taskfile.dist.yaml",
      ".taskrc.yml",
      ".taskrc.yaml",
    ],
  },
  "tauri-ignore": {
    fileNames: [".taurignore"],
  },
  tauri: {
    fileNames: [
      "tauri.conf.json",
      "tauri.conf.json5",
      "tauri.config.json",
      "tauri.linux.conf.json",
      "tauri.windows.conf.json",
      "tauri.macos.conf.json",
      "Tauri.toml",
    ],
    fileExtensions: ["tauri"],
  },
  terraform: {
    languageIds: ["terraform"],
    fileExtensions: ["tf", "tf.json", "tfvars", "tfstate", "tfbackend"],
  },
  text: {
    languageIds: ["plaintext"],
    fileExtensions: ["txt"],
  },
  todo: {
    fileExtensions: ["todo"],
    fileNames: ["todo.md", "todos.md"],
  },
  toml: {
    languageIds: ["toml"],
    fileExtensions: ["toml"],
  },
  turbo: {
    fileNames: ["turbo.json"],
  },
  twig: {
    languageIds: ["twig"],
    fileExtensions: ["twig"],
  },
  twine: {
    languageIds: [
      "twee3",
      "twee3-harlowe-3",
      "twee3-chapbook-1",
      "twee3-sugarcube-2",
    ],
    fileExtensions: ["tw", "twee"],
  },
  "typescript-config": {
    fileNames: [
      "tsconfig.json",
      "tsconfig.app.json",
      "tsconfig.editor.json",
      "tsconfig.spec.json",
      "tsconfig.base.json",
      "tsconfig.build.json",
      "tsconfig.eslint.json",
      "tsconfig.lib.json",
      "tsconfig.lib.prod.json",
      "tsconfig.node.json",
      "tsconfig.test.json",
      "tsconfig.e2e.json",
      "tsconfig.web.json",
      "tsconfig.webworker.json",
      "tsconfig.worker.json",
      "tsconfig.config.json",
      "tsconfig.vitest.json",
      "tsconfig.cjs.json",
      "tsconfig.esm.json",
      "tsconfig.mjs.json",
      "tsconfig.doc.json",
      "tsconfig.paths.json",
      "tsconfig.main.json",
      "tsconfig.cypress-ct.json",
      "tsconfig.components.json",
    ],
    fileExtensions: ["tsconfig.json"],
  },
  "typescript-def": {
    fileExtensions: ["d.ts", "d.cts", "d.mts"],
  },
  "typescript-react": {
    languageIds: ["typescriptreact"],
    fileExtensions: ["tsx"],
  },
  "typescript-test": {
    fileExtensions: [
      "spec.ts",
      "spec.cts",
      "spec.mts",
      "cy.ts",
      "e2e-spec.ts",
      "e2e-spec.cts",
      "e2e-spec.mts",
      "test.ts",
      "test.cts",
      "test.mts",
      "ts.snap",

      "spec-d.ts",
      "test-d.ts",

      "spec.tsx",
      "test.tsx",
      "tsx.snap",
      "cy.tsx",
    ],
  },
  typescript: {
    languageIds: ["typescript"],
    fileExtensions: ["ts", "cts", "mts"],
  },
  typst: {
    languageIds: ["typst"],
    fileExtensions: ["typ"],
    fileNames: ["typst.toml"],
  },
  unity: {
    languageIds: ["shaderlab"],
    fileExtensions: ["unity"],
  },
  unocss: {
    fileNames: [
      "uno.config.js",
      "uno.config.mjs",
      "uno.config.ts",
      "uno.config.mts",
      "unocss.config.js",
      "unocss.config.mjs",
      "unocss.config.ts",
      "unocss.config.mts",
    ],
  },
  url: {
    fileExtensions: ["url"],
  },
  uv: {
    fileNames: ["uv.lock"],
  },
  v: {
    languageIds: ["v"],
    fileExtensions: ["v"],
    fileNames: ["vpkg.json", "v.mod"],
  },
  vala: {
    languageIds: ["vala"],
    fileExtensions: ["vala"],
  },
  "vanilla-extract": {
    fileExtensions: ["css.ts"],
  },
};
