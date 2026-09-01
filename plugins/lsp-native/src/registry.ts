/**
 * Curated language-server catalog. npm-based servers are auto-installable into
 * an app-managed dir (versions pinned here); binary servers (rust-analyzer,
 * gopls) are PATH-detected only. User overrides/custom servers merge in via
 * config.ts.
 */
import type { LspServerConfig } from "./types";

export const CURATED_SERVERS: LspServerConfig[] = [
  {
    id: "typescript",
    name: "TypeScript / JavaScript",
    languages: ["ts", "tsx", "js", "jsx", "mjs", "cjs"],
    command: "typescript-language-server",
    args: ["--stdio"],
    rootMarkers: ["tsconfig.json", "jsconfig.json", "package.json", ".git"],
    autoInstall: {
      npmPackage: "typescript-language-server",
      version: "4.4.1",
      // tsserver itself; resolved next to the language server at spawn time.
      extraPackages: ["typescript@5.9.3"],
    },
    enabled: true,
  },
  {
    id: "pyright",
    name: "Python (Pyright)",
    languages: ["py"],
    command: "pyright-langserver",
    args: ["--stdio"],
    rootMarkers: [
      "pyproject.toml",
      "setup.py",
      "requirements.txt",
      "Pipfile",
      ".git",
    ],
    autoInstall: {
      npmPackage: "pyright",
      version: "1.1.407",
      bin: "pyright-langserver",
    },
    enabled: true,
  },
  {
    id: "json",
    name: "JSON",
    languages: ["json", "jsonc"],
    command: "vscode-json-language-server",
    args: ["--stdio"],
    rootMarkers: ["package.json", ".git"],
    autoInstall: {
      npmPackage: "vscode-langservers-extracted",
      version: "4.10.0",
      bin: "vscode-json-language-server",
    },
    initializationOptions: { provideFormatter: false },
    enabled: true,
  },
  {
    id: "css",
    name: "CSS / SCSS / Less",
    languages: ["css", "scss", "less"],
    command: "vscode-css-language-server",
    args: ["--stdio"],
    rootMarkers: ["package.json", ".git"],
    autoInstall: {
      npmPackage: "vscode-langservers-extracted",
      version: "4.10.0",
      bin: "vscode-css-language-server",
    },
    enabled: true,
  },
  {
    // Claims .html ONLY inside Angular projects (projectMarkers) — everywhere
    // else the generic HTML server below stays responsible. Probe locations
    // point ngserver at the project's own typescript/@angular packages.
    id: "angular",
    name: "Angular (ngserver)",
    languages: ["html"],
    projectMarkers: ["angular.json", "nx.json"],
    command: "ngserver",
    // Probe the project first; our managed install bundles
    // @angular/language-service + typescript as the fallback, so projects
    // without the (dev-only) language-service package still get ngserver.
    args: [
      "--stdio",
      "--tsProbeLocations",
      "${root}/node_modules,${serverModules}",
      "--ngProbeLocations",
      "${root}/node_modules,${serverModules}",
    ],
    rootMarkers: ["angular.json", "nx.json", ".git"],
    autoInstall: {
      npmPackage: "@angular/language-server",
      version: "22.0.7",
      bin: "ngserver",
    },
    enabled: true,
  },
  {
    id: "html",
    name: "HTML",
    languages: ["html"],
    command: "vscode-html-language-server",
    args: ["--stdio"],
    rootMarkers: ["package.json", ".git"],
    autoInstall: {
      npmPackage: "vscode-langservers-extracted",
      version: "4.10.0",
      bin: "vscode-html-language-server",
    },
    enabled: true,
  },
  {
    // Secondary (linter class): runs ALONGSIDE the typescript server; its
    // diagnostics merge into the same gutter. Only activates in projects
    // with an ESLint config, and needs eslint installed in the project.
    id: "eslint",
    name: "ESLint",
    role: "secondary",
    languages: ["ts", "tsx", "js", "jsx", "mjs", "cjs", "vue"],
    projectMarkers: [
      "eslint.config.js",
      "eslint.config.mjs",
      "eslint.config.cjs",
      "eslint.config.ts",
      ".eslintrc.js",
      ".eslintrc.cjs",
      ".eslintrc.json",
      ".eslintrc.yml",
    ],
    command: "vscode-eslint-language-server",
    args: ["--stdio"],
    rootMarkers: ["package.json", ".git"],
    autoInstall: {
      npmPackage: "vscode-langservers-extracted",
      version: "4.10.0",
      bin: "vscode-eslint-language-server",
    },
    // The ESLint LS pulls these via workspace/configuration per document.
    settings: {
      validate: "on",
      run: "onType",
      workingDirectory: { mode: "auto" },
      nodePath: null,
      problems: { shortenToSingleLine: false },
      experimental: {},
      codeActionOnSave: { enable: false },
      format: false,
    },
    enabled: true,
  },
  {
    // Secondary: Tailwind class completions/hovers next to the primary server.
    // v3 projects are detected via config files; v4 (CSS-first) users can
    // clear projectMarkers via settings if needed.
    id: "tailwind",
    name: "Tailwind CSS",
    role: "secondary",
    languages: ["html", "css", "scss", "tsx", "jsx", "vue"],
    projectMarkers: [
      "tailwind.config.js",
      "tailwind.config.cjs",
      "tailwind.config.mjs",
      "tailwind.config.ts",
    ],
    command: "tailwindcss-language-server",
    args: ["--stdio"],
    rootMarkers: ["package.json", ".git"],
    autoInstall: {
      npmPackage: "@tailwindcss/language-server",
      version: "0.16.0",
      bin: "tailwindcss-language-server",
    },
    enabled: true,
  },
  {
    id: "rust-analyzer",
    name: "Rust (rust-analyzer)",
    languages: ["rs"],
    command: "rust-analyzer",
    args: [],
    rootMarkers: ["Cargo.toml"],
    enabled: true,
  },
  {
    id: "gopls",
    name: "Go (gopls)",
    languages: ["go"],
    command: "gopls",
    args: [],
    rootMarkers: ["go.work", "go.mod"],
    enabled: true,
  },
];
