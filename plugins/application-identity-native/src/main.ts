import { app } from "electron";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  APPLICATION_INFO_SERVICE,
  type ApplicationInfoCapability,
} from "@termco/application-base";
import type { PluginModule } from "@termco/kernel";
import { applicationName } from "./identity";

const plugin: PluginModule = {
  inject: [],
  activate(context) {
    const applicationInfo: ApplicationInfoCapability = {
      getInfo: async () => {
        let version = app.getVersion();
        if (!app.isPackaged) {
          try {
            const manifest = JSON.parse(
              await readFile(join(app.getAppPath(), "package.json"), "utf8"),
            ) as { version?: unknown };
            if (typeof manifest.version === "string") version = manifest.version;
          } catch {
            // Electron's value remains a valid development fallback.
          }
        }
        return {
          name: applicationName(app.isPackaged, app.getName()),
          version,
          bundleId: "app.termco",
          platform: process.platform,
          architecture: process.arch,
        };
      },
    };
    context.provide(APPLICATION_INFO_SERVICE, applicationInfo);
  },
};

export default plugin;
