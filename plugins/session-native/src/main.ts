import { app } from "electron";
import { join } from "node:path";
import { SESSION_HISTORY_SERVICE } from "@termco/session-base";
import type { PluginModule } from "@termco/kernel";
import { createSessionHistory } from "./index";
import { JsonlSessionPersistence } from "./jsonlPersistence";

const plugin: PluginModule = {
  inject: [],
  async activate(context) {
    const history = createSessionHistory(
      new JsonlSessionPersistence(join(app.getPath("userData"), "sessions")),
    );
    context.provide(SESSION_HISTORY_SERVICE, history);
    await context.effect(() => () => history.dispose());
  },
};

export default plugin;
