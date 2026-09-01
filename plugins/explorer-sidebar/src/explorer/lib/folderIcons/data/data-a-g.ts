/**
 * Folder-icon associations, shard 1 of 3 (keys "admin" through "gradle").
 *
 * One slice of the full folder-icon map. Each key is an icon-file basename
 * (without the `folder_` prefix); the value lists the folder names that map to
 * it. Merged with the sibling shards in `../map.ts`.
 *
 * @keep-sorted
 */
import type { FolderIconEntry } from "../types";

export const folderIcons_a_g: Record<string, FolderIconEntry> = {
  admin: {
    folderNames: [
      "admin",
      "admins",
      "manager",
      "managers",
      "moderator",
      "moderators",
    ],
  },
  android: {
    folderNames: ["android"],
  },
  animation: {
    folderNames: ["anim", "anims", "animation", "animations", "animated"],
  },
  api: {
    folderNames: ["api", "apis", "restapi"],
  },
  app: {
    folderNames: ["app", "apps"],
  },
  assets: {
    folderNames: ["asset", "assets"],
  },
  audio: {
    folderNames: ["aud", "auds", "audio", "audios", "music", "sound", "sounds"],
  },
  audit: {
    folderNames: ["audit", "audits"],
  },
  aws: {
    folderNames: ["aws", ".aws"],
  },
  "azure-devops": {
    folderNames: [".azure-devops", ".azuredevops"],
  },
  "azure-pipelines": {
    folderNames: [".azure-pipelines"],
  },
  benchmark: {
    folderNames: [
      "benchmark",
      "benchmarks",
      "bench",
      "benches",
      "performance",
      "measure",
      "measures",
      "measurement",
    ],
  },
  caddy: {
    folderNames: [".caddy", ".caddyfiles", "caddy", "caddyfiles"],
  },
  cargo: {
    folderNames: [".cargo"],
  },
  "circle-ci": {
    folderNames: [".circleci"],
  },
  client: {
    folderNames: ["client", "clients", "frontend", "frontends", "pwa"],
  },
  cloud: {
    folderNames: ["cloud"],
  },
  command: {
    folderNames: ["command", "commands", "cmd", "cli", "clis"],
  },
  components: {
    folderNames: ["components", "widget", "widgets", "fragments"],
  },
  composables: {
    folderNames: ["composable", "composables"],
  },
  config: {
    folderNames: [
      "cfg",
      "cfgs",
      "conf",
      "confs",
      ".config",
      "config",
      "configs",
      "configuration",
      "configurations",
      "setting",
      ".setting",
      "settings",
      ".settings",
      "META-INF",
      "option",
      "options",
    ],
  },
  connection: {
    folderNames: ["connection", "connections", "integration", "integrations"],
  },
  constant: {
    folderNames: ["constant", "constants"],
  },
  content: {
    folderNames: ["content", "contents"],
  },
  controllers: {
    folderNames: [
      "controller",
      "controllers",
      "service",
      "services",
      "provider",
      "providers",
      "handler",
      "handlers",
    ],
  },
  core: {
    folderNames: ["core"],
  },
  coverage: {
    folderNames: [
      "coverage",
      ".nyc-output",
      ".nyc_output",
      "e2e",
      "it",
      "integration-test",
      "integration-tests",
      "__integration-test__",
      "__integration-tests__",
    ],
  },
  cursor: {
    folderNames: [".cursor"],
  },
  cypress: {
    folderNames: ["cypress", ".cypress"],
  },
  database: {
    folderNames: ["db", "database", "databases", "sql", "data", "_data"],
  },
  debug: {
    folderNames: ["debug", "debugging"],
  },
  devcontainer: {
    folderNames: [".devcontainer"],
  },
  direnv: {
    folderNames: [".direnv"],
  },
  dist: {
    folderNames: [
      "dist",
      "dist-newstyle",
      "out",
      "build",
      "release",
      "bin",
      ".output",
    ],
  },
  docker: {
    folderNames: ["docker", "dockerfiles", ".docker"],
  },
  docs: {
    folderNames: [
      "_post",
      "_posts",
      "doc",
      "docs",
      "document",
      "documents",
      "documentation",
      "post",
      "posts",
      "article",
      "articles",
    ],
  },
  download: {
    folderNames: ["downloads", "download"],
  },
  "drizzle-orm": {
    folderNames: ["drizzle"],
  },
  examples: {
    folderNames: [
      "demo",
      "demos",
      "example",
      "examples",
      "sample",
      "samples",
      "sample-data",
    ],
  },
  fastlane: {
    folderNames: ["fastlane", ".fastlane"],
  },
  firebase: {
    folderNames: ["firebase", ".firebase"],
  },
  fonts: {
    folderNames: ["font", "fonts"],
  },
  forgejo: {
    folderNames: [".forgejo"],
  },
  functions: {
    folderNames: [
      "func",
      "funcs",
      "function",
      "functions",
      "lambda",
      "lambdas",
      "logic",
      "math",
      "maths",
      "calc",
      "calcs",
      "calculation",
      "calculations",
    ],
  },
  fvm: {
    folderNames: [".fvm"],
  },
  git: {
    folderNames: [
      ".git",
      "patches",
      "githooks",
      ".githooks",
      "submodules",
      ".submodules",
    ],
  },
  github: {
    folderNames: [".github", "github"],
  },
  gitlab: {
    folderNames: [".gitlab"],
  },
  gradle: {
    folderNames: ["gradle", ".gradle"],
  },
};
