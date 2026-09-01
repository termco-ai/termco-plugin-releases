import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AI_BROWSER_POLICY_SERVICE } from "@termco/ai-tools-base";
import { WORKSPACE_FILE_ICONS_SERVICE } from "@termco/files-base";
import {
  ONBOARDING_REGISTRY_SERVICE,
  ONBOARDING_RUNTIME_SERVICE,
} from "@termco/onboarding-base";
import { TRAJECTORY_NAVIGATION_SERVICE } from "@termco/trajectory-base";
import { UI_TABS_KINDS_SERVICE } from "@termco/ui-tabs-base";
import { describe, expect, it } from "vitest";
import plugin from "./plugin";

describe("AI Chat visual capability dependencies", () => {
  it("keeps trajectory navigation optional when the company profile removes it", () => {
    expect(plugin.inject).not.toContain(TRAJECTORY_NAVIGATION_SERVICE);
    expect(plugin.optionalInject).toEqual([
      AI_BROWSER_POLICY_SERVICE,
      TRAJECTORY_NAVIGATION_SERVICE,
      WORKSPACE_FILE_ICONS_SERVICE,
      ONBOARDING_REGISTRY_SERVICE,
      ONBOARDING_RUNTIME_SERVICE,
    ]);
    const source = readFileSync(join(import.meta.dirname, "plugin.ts"), "utf8");
    expect(source).toContain("context.observe<TrajectoryNavigationCapability>");
    expect(source).toContain("trajectoryNavigation.subscribe(refresh)");
    expect(plugin.inject).not.toContain(UI_TABS_KINDS_SERVICE);
    expect(source).toMatch(
      /id: "dock-integration"[\s\S]*?requires: \[[\s\S]*?UI_TABS_KINDS_SERVICE/,
    );
    expect(source).toContain("tabKinds.subscribe(refresh)");
    expect(source).toContain('entry.kinds.includes("trajectory")');
  });
});
