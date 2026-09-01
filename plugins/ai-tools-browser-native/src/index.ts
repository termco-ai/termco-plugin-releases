import type { BrowserAutomationCapability } from "@termco/browser-base";
import type { AiToolRegistry } from "@termco/ai-tools-base";
import type { PluginModule } from "@termco/kernel";
import { BrowserToolSet } from "./tools";
import { BROWSER_AUTOMATION_SERVICE } from "@termco/browser-base";
import { AI_TOOLS_SERVICE } from "@termco/ai-tools-base";

const plugin: PluginModule = {
  inject: [
    BROWSER_AUTOMATION_SERVICE,
    AI_TOOLS_SERVICE,
  ],
  async activate(context) {
    const tools = new BrowserToolSet(
      context.get<BrowserAutomationCapability>("browser.automation"),
    );
    const contribution = tools.contribution();
    await context.effect(() =>
      context.get<AiToolRegistry>("ai.tools").register(contribution),
    );
    context.provide("ai.browser-policy", tools.policy());
  },
};

export default plugin;
