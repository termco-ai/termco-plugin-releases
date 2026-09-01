/**
 * File-icon associations, shard 4 of 6 (keys "mjml" through "rokit").
 *
 * One slice of the full icon map. Each key is an icon-file basename; the value
 * lists the language ids, file extensions, and file names that map to it.
 * Merged with the sibling shards in `../map.ts`. Do not reorder relative to the
 * other shards: later entries win when two icons claim the same token.
 *
 * @keep-sorted
 */
import type { FileIconEntry } from "../types";

export const fileIcons_m_r: Record<string, FileIconEntry> = {
  mjml: {
    fileExtensions: ["mjml"],
    fileNames: [".mjmlconfig"],
  },
  modernizr: {
    fileNames: [".modernizrrc", ".modernizrrc.js", ".modernizrrc.json"],
  },
  moonrepo: {
    fileNames: ["moon.yml", "moon.yaml"],
  },
  moonwave: {
    fileNames: ["moonwave.toml"],
  },
  "ms-excel": {
    fileExtensions: [
      "xlsx",
      "xlsm",
      "xls",
      "xlsb",
      "xltx",
      "xltm",
      "xlt",
      "ods",
    ],
  },
  "ms-powerpoint": {
    fileExtensions: [
      "pptx",
      "ppt",
      "pptm",
      "potx",
      "potm",
      "ppsx",
      "ppsm",
      "pps",
      "ppam",
      "ppa",
      "odp",
    ],
  },
  "ms-word": {
    fileExtensions: [
      "doc",
      "docm",
      "docx",
      "dot",
      "dotm",
      "dotx",
      "rtf",
      "odt",
    ],
  },
  msbuild: {
    fileNames: [
      "directory.build.props",
      "directory.build.rsp",
      "directory.build.targets",
      "directory.packages.props",
    ],
  },
  nativescript: {
    fileNames: ["nativescript.config.ts", "nativescript.config.js"],
  },
  nest: {
    fileNames: [
      "nest-cli.json",
      ".nest-cli.json",
      "nestconfig.json",
      ".nestconfig.json",
    ],
  },
  netlify: {
    fileNames: ["netlify.json", "netlify.yml", "netlify.yaml", "netlify.toml"],
  },
  next: {
    fileNames: [
      "next.config.js",
      "next.config.mjs",
      "next.config.ts",
      "next.config.mts",
    ],
  },
  nextflow: {
    fileExtensions: ["nf"],
  },
  nginx: {
    fileNames: ["nginx.conf"],
    fileExtensions: ["nginx", "nginxconf", "nginxconfig"],
  },
  nim: {
    languageIds: ["nim", "nimble"],
    fileExtensions: ["nim", "nimble"],
  },
  ninja: {
    fileExtensions: ["ninja"],
  },
  "nix-lock": {
    fileNames: ["flake.lock"],
  },
  nix: {
    languageIds: ["nix"],
    fileExtensions: ["nix"],
  },
  nodemon: {
    fileNames: ["nodemon.json", "nodemon-debug.json"],
  },
  "npm-ignore": {
    fileNames: [".npmignore"],
  },
  "npm-lock": {
    fileNames: ["package-lock.json"],
  },
  npm: {
    fileNames: [".npmrc"],
  },
  nuget: {
    fileNames: ["nuget.config", ".nuspec", "nuget.exe"],
    fileExtensions: ["nupkg"],
  },
  nunjucks: {
    languageIds: ["nunjucks"],
    fileExtensions: ["njk", "nunjucks"],
  },
  "nuxt-ignore": {
    fileNames: [".nuxtignore"],
  },
  nuxt: {
    fileNames: [".nuxtrc", "nuxt.config.js", "nuxt.config.ts"],
  },
  "nx-ignore": {
    fileNames: [".nxignore"],
  },
  nx: {
    fileNames: ["nx.json"],
  },
  ocaml: {
    fileExtensions: ["ml", "mli", "cmx"],
  },
  odin: {
    languageIds: ["odin"],
    fileExtensions: ["odin"],
  },
  opentofu: {
    languageIds: ["opentofu"],
    fileExtensions: ["tofu", "tofu.json"],
  },
  org: {
    languageIds: ["org"],
    fileExtensions: ["org"],
  },
  "package-json": {
    fileNames: ["package.json", ".nvmrc", ".esmrc", ".node-version"],
  },
  "panda-css": {
    fileNames: [
      "panda.config.ts",
      "panda.config.js",
      "panda.config.mjs",
      "panda.config.mts",
      "panda.config.cjs",
    ],
  },
  pdf: {
    fileExtensions: ["pdf"],
  },
  perl: {
    languageIds: ["perl", "perl6", "raku"],
    fileExtensions: [
      "pl",
      "pm",
      "pod",
      "t",
      "psgi",
      "raku",
      "rakumod",
      "rakutest",
      "rakudoc",
      "nqp",
      "p6",
      "pl6",
      "pm6",
    ],
  },
  "pesde-lock": {
    fileNames: ["pesde.lock"],
  },
  pesde: {
    fileNames: ["pesde.toml"],
  },
  php: {
    languageIds: ["php"],
    fileExtensions: ["php"],
  },
  phrase: {
    fileNames: [
      ".phrase.yml",
      ".phraseapp.yml",
      ".phrase.yaml",
      ".phraseapp.yaml",
    ],
  },
  phtml: {
    fileExtensions: ["phtml"],
  },
  "pixi-lock": {
    fileNames: ["pixi.lock"],
  },
  pixi: {
    fileNames: ["pixi.toml"],
  },
  plantuml: {
    fileExtensions: ["pu", "puml", "plantuml"],
  },
  playwright: {
    fileNames: [
      "playwright.config.js",
      "playwright.config.mjs",
      "playwright.config.ts",
      "playwright.config.base.js",
      "playwright.config.base.mjs",
      "playwright.config.base.ts",
      "playwright-ct.config.js",
      "playwright-ct.config.mjs",
      "playwright-ct.config.ts",
    ],
  },
  plop: {
    fileNames: ["plopfile.js", "plopfile.cjs", "plopfile.mjs", "plopfile.ts"],
  },
  "pnpm-lock": {
    fileNames: ["pnpm-lock.yaml"],
  },
  pnpm: {
    fileNames: ["pnpm-workspace.yaml", ".pnpmfile.cjs"],
  },
  "poetry-lock": {
    fileNames: ["poetry.lock"],
  },
  postcss: {
    languageIds: ["postcss"],
    fileExtensions: ["pcss", "sss"],
    fileNames: [
      "postcss.config.js",
      "postcss.config.cjs",
      "postcss.config.mjs",
      "postcss.config.ts",
      "postcss.config.cts",
      "postcss.config.mts",
      ".postcssrc.js",
      ".postcssrc.cjs",
      ".postcssrc.ts",
      ".postcssrc.cts",
      ".postcssrc",
      ".postcssrc.json",
      ".postcssrc.yaml",
      ".postcssrc.yml",
    ],
  },
  powershell: {
    languageIds: ["powershell"],
    fileExtensions: ["ps1", "psm1", "psd1", "ps1xml", "psc1", "pssc"],
  },
  "pre-commit": {
    fileNames: [".pre-commit-config.yaml", ".pre-commit-hooks.yaml"],
  },
  premake: {
    fileNames: ["premake4.lua", "premake5.lua", "premake.lua"],
  },
  "prettier-ignore": {
    fileNames: [".prettierignore"],
  },
  prettier: {
    fileNames: [
      ".prettierrc",
      ".prettierrc.json",
      ".prettierrc.yml",
      ".prettierrc.yaml",
      ".prettierrc.json5",
      ".prettierrc.js",
      "prettier.config.js",
      ".prettierrc.ts",
      "prettier.config.ts",
      ".prettierrc.mjs",
      "prettier.config.mjs",
      ".prettierrc.mts",
      "prettier.config.mts",
      ".prettierrc.cjs",
      "prettier.config.cjs",
      ".prettierrc.cts",
      "prettier.config.cts",
      ".prettierrc.toml",
    ],
  },
  prisma: {
    fileNames: [
      "prisma.config.ts",
      "prisma.config.js",
      "prisma.config.cts",
      "prisma.config.cjs",
      "prisma.config.mts",
      "prisma.config.mjs",
      "prisma.yml",
    ],
    fileExtensions: ["prisma"],
  },
  prolog: {
    languageIds: ["prolog"],
    fileExtensions: ["p", "pro"],
  },
  properties: {
    languageIds: ["ini", "properties", "spring-boot-properties"],
    fileExtensions: [
      "ini",
      "dlc",
      "config",
      "conf",
      "properties",
      "prop",
      "settings",
      "option",
      "props",
      "prefs",
      "sln.dotsettings",
      "sln.dotsettings.user",
      "cfg",
    ],
  },
  proto: {
    languageIds: ["proto"],
    fileExtensions: ["proto"],
  },
  prototools: {
    fileNames: [".prototools"],
  },
  pug: {
    languageIds: ["jade"],
    fileExtensions: ["jade", "pug"],
    fileNames: [".pug-lintrc", ".pug-lintrc.js", ".pug-lintrc.json"],
  },
  puppet: {
    languageIds: ["puppet"],
    fileExtensions: ["pp", "epp"],
  },
  puppeteer: {
    fileNames: [
      ".puppeteerrc.cjs,",
      ".puppeteerrc.js,",
      ".puppeteerrc",
      ".puppeteerrc.json,",
      ".puppeteerrc.yaml,",
      "puppeteer.config.js",
      "puppeteer.config.cjs",
    ],
  },
  "python-compiled": {
    fileExtensions: ["pyc", "pyo", "pyd"],
  },
  "python-config": {
    fileNames: [
      "pyproject.toml",
      "requirements.txt",
      "requirements-dev.txt",
      "requirements-test.txt",
      ".python-version",
    ],
  },
  python: {
    languageIds: ["python"],
    fileExtensions: ["py"],
  },
  r: {
    languageIds: ["r", "rsweave"],
    fileExtensions: ["r"],
    fileNames: [".rhistory"],
  },
  racket: {
    fileExtensions: ["rkt"],
  },
  razor: {
    languageIds: ["razor", "aspnetcorerazor"],
    fileExtensions: ["cshtml", "vbhtml"],
  },
  rdata: {
    fileExtensions: ["rdata"],
  },
  readme: {
    fileNames: ["readme.md", "readme.rst", "readme.txt", "readme"],
  },
  reason: {
    languageIds: ["reason", "reason_lisp"],
    fileExtensions: ["re", "rei"],
  },
  redwood: {
    fileNames: ["redwood.toml"],
  },
  release: {
    fileNames: [".goreleaser.yaml"],
  },
  remix: {
    fileNames: ["remix.config.js", "remix.config.ts"],
  },
  renovate: {
    fileNames: [
      ".renovaterc",
      ".renovaterc.json",
      "renovate-config.json",
      "renovate.json",
      "renovate.json5",
    ],
  },
  rescript: {
    languageIds: ["rescript"],
    fileExtensions: ["res"],
  },
  rmd: {
    fileExtensions: ["rmd"],
  },
  roblox: {
    fileExtensions: ["rbxl", "rbxlx", "rbxm", "rbxmx"],
  },
  robots: {
    fileNames: ["robots.txt"],
  },
  rocket: {
    fileNames: ["rocket.toml"],
  },
  rokit: {
    fileNames: ["rokit.toml"],
  },
};
