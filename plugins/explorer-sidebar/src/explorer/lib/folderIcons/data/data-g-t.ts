/**
 * Folder-icon associations, shard 2 of 3 (keys "graphql" through "themes").
 *
 * One slice of the full folder-icon map. Each key is an icon-file basename
 * (without the `folder_` prefix); the value lists the folder names that map to
 * it. Merged with the sibling shards in `../map.ts`.
 *
 * @keep-sorted
 */
import type { FolderIconEntry } from "../types";

export const folderIcons_g_t: Record<string, FolderIconEntry> = {
  graphql: {
    folderNames: ["graphql", "gql"],
  },
  hooks: {
    folderNames: ["hook", "hooks", "trigger", "triggers"],
  },
  husky: {
    folderNames: ["husky", ".husky"],
  },
  images: {
    folderNames: [
      "_images",
      "_image",
      "_imgs",
      "_img",
      "images",
      "image",
      "imgs",
      "img",
      "icons",
      "icon",
      "icos",
      "ico",
      "figures",
      "figure",
      "figs",
      "fig",
      "screenshot",
      "screenshots",
      "screengrab",
      "screengrabs",
      "pic",
      "pics",
      "picture",
      "pictures",
      "photo",
      "photos",
      "photograph",
      "photographs",
    ],
  },
  include: {
    folderNames: ["include", "includes"],
  },
  intellij: {
    folderNames: [".idea"],
  },
  javascript: {
    folderNames: ["js", "javascript"],
  },
  kubernetes: {
    folderNames: ["kubernetes", ".kubernetes", "k8s", ".k8s"],
  },
  layouts: {
    folderNames: ["layout", "layouts", "_layouts"],
  },
  lib: {
    folderNames: [
      "lib",
      "libs",
      "library",
      "libraries",
      ".lib",
      ".libs",
      ".library",
      ".libraries",
    ],
  },
  linux: {
    folderNames: ["linux"],
  },
  locales: {
    folderNames: [
      "i18n",
      "internationalization",
      "lang",
      "langs",
      "language",
      "languages",
      "locale",
      "locales",
      "l10n",
      "localization",
      "translation",
      "translate",
      "translations",
      ".tx",
    ],
  },
  luau: {
    folderNames: ["luau_packages"],
  },
  lune: {
    folderNames: ["lune_packages"],
  },
  macos: {
    folderNames: ["mac", "macos"],
  },
  messages: {
    folderNames: ["message", "messages"],
  },
  middleware: {
    folderNames: ["middleware", "middlewares"],
  },
  mocks: {
    folderNames: [
      "_draft",
      "_drafts",
      "mock",
      "mocks",
      "fixture",
      "fixtures",
      "draft",
      "drafts",
      "concept",
      "concepts",
      "sketch",
      "sketches",
    ],
  },
  moonrepo: {
    folderNames: [".moon"],
  },
  next: {
    folderNames: [".next"],
  },
  nix: {
    folderNames: ["nix"],
  },
  node: {
    folderNames: ["node_modules"],
  },
  nuxt: {
    folderNames: ["nuxt", ".nuxt"],
  },
  packages: {
    folderNames: ["package", "packages", "pkg", "pkgs", "crate", "crates"],
  },
  pesde: {
    folderNames: [".pesde", "pesde"],
  },
  plugins: {
    folderNames: [
      "plugin",
      "plugins",
      "_plugins",
      "mod",
      "mods",
      "modding",
      "extension",
      "extensions",
      "addon",
      "addons",
      "module",
      "modules",
    ],
  },
  "pre-commit": {
    folderNames: ["pre-commit-channel"],
  },
  prisma: {
    folderNames: ["prisma"],
  },
  private: {
    folderNames: ["private"],
  },
  proto: {
    folderNames: ["protobuf", "protobufs", "proto", "protos"],
  },
  public: {
    folderNames: [
      "_site",
      "public",
      "www",
      "wwwroot",
      "web",
      "website",
      "site",
      "browser",
      "browsers",
    ],
  },
  queue: {
    folderNames: ["queue", "queues", "bull", "mq"],
  },
  redux: {
    folderNames: ["redux"],
  },
  renovate: {
    folderNames: [".renovate", "renovate"],
  },
  roblox: {
    folderNames: ["roblox_packages", "roblox_server_packages"],
  },
  routes: {
    folderNames: ["routes", "router", "routers"],
  },
  sass: {
    folderNames: ["sass", "_sass", "scss", "_scss"],
  },
  scripts: {
    folderNames: ["script", "scripts", "scripting"],
  },
  security: {
    folderNames: ["security"],
  },
  server: {
    folderNames: ["server", "servers", "backend"],
  },
  shared: {
    folderNames: ["share", "shared"],
  },
  src: {
    folderNames: ["src", "srcs", "source", "sources", "code"],
  },
  storybook: {
    folderNames: [".storybook", "storybook", "stories", "__stories__"],
  },
  styles: {
    folderNames: ["css", "stylesheet", "stylesheets", "style", "styles"],
  },
  svg: {
    folderNames: ["svg", "svgs"],
  },
  tauri: {
    folderNames: ["src-tauri"],
  },
  temp: {
    folderNames: ["temp", ".temp", "tmp", ".tmp", "cached", "cache", ".cache"],
  },
  templates: {
    folderNames: ["template", "templates"],
  },
  tests: {
    folderNames: [
      "test",
      "tests",
      "testing",
      "__tests__",
      "__snapshots__",
      "__mocks__",
      "__fixtures__",
      "__test__",
      "spec",
      "specs",
    ],
  },
  themes: {
    folderNames: ["theme", "themes"],
  },
};
