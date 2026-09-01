import type { PluginModule } from "@termco/kernel";
import {
  SESSION_HISTORY_SERVICE,
  SESSION_MODEL_QUERY_SERVICE,
  SESSION_QUERY_SERVICE,
  type SessionHistoryCapability,
  type SessionModelQueryCapability,
  type SessionQueryCapability,
} from "@termco/session-base";
import { createModelSessionQuery, createSessionQuery } from "./query";

const plugin: PluginModule = {
  inject: [SESSION_HISTORY_SERVICE],
  async activate(context) {
    const history = context.get<SessionHistoryCapability>(SESSION_HISTORY_SERVICE);
    const query = createSessionQuery(history);
    context.provide<SessionQueryCapability>(SESSION_QUERY_SERVICE, query);
    context.provide<SessionModelQueryCapability>(
      SESSION_MODEL_QUERY_SERVICE,
      createModelSessionQuery(history),
    );
  },
};

export default plugin;
