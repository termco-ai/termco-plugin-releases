import { describe, expect, it } from "vitest";
import type { AiAgentIconId as AgentIconId } from "@termco/ai-library-base";
import { ICONS } from "./icons";

const ALL_ICON_IDS: AgentIconId[] = [
  "coder",
  "architect",
  "reviewer",
  "security",
  "designer",
  "debugger",
  "tester",
  "refactor",
  "devops",
  "explainer",
  "interviewer",
  "spark",
];

describe("ICONS", () => {
  it("defines a glyph for every AgentIconId", () => {
    for (const id of ALL_ICON_IDS) {
      expect(ICONS[id], `icon for ${id}`).toBeDefined();
    }
  });

  it("has exactly the AgentIconId keys", () => {
    expect(Object.keys(ICONS).sort()).toEqual([...ALL_ICON_IDS].sort());
  });
});
