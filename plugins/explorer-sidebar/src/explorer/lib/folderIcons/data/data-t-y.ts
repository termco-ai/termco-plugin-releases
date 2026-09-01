/**
 * Folder-icon associations, shard 3 of 3 (keys "turbo" through "yarn").
 *
 * One slice of the full folder-icon map. Each key is an icon-file basename
 * (without the `folder_` prefix); the value lists the folder names that map to
 * it. Merged with the sibling shards in `../map.ts`.
 *
 * @keep-sorted
 */
import type { FolderIconEntry } from "../types";

export const folderIcons_t_y: Record<string, FolderIconEntry> = {
  turbo: {
    folderNames: [".turbo"],
  },
  types: {
    folderNames: ["typings", "@types", "types"],
  },
  upload: {
    folderNames: ["uploads", "upload"],
  },
  utils: {
    folderNames: ["util", "utils", "utility", "utilities"],
  },
  vercel: {
    folderNames: ["vercel", ".vercel", "now", ".now"],
  },
  video: {
    folderNames: ["vid", "vids", "video", "videos", "movie", "movies"],
  },
  views: {
    folderNames: [
      "view",
      "views",
      "screen",
      "screens",
      "page",
      "pages",
      "public_html",
      "html",
    ],
  },
  vscode: {
    folderNames: [".vscode", ".vscode-test"],
  },
  windows: {
    folderNames: ["windows"],
  },
  workflows: {
    folderNames: ["workflow", "workflows", "ci", ".ci"],
  },
  wxt: {
    folderNames: [".wxt"],
  },
  xcode: {
    folderNames: ["xcodeproj", "xcworkspace", "xcshareddata", "xcschemes"],
  },
  xmake: {
    folderNames: ["xmake", ".xmake"],
  },
  yarn: {
    folderNames: [".yarn"],
  },
};
