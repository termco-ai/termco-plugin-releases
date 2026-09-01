import { describe, expect, it } from "vitest";
import type { UiCommandItem } from "@termco/ui-commands-base";
import {
  filterCommands,
  orderedCommandContributions,
  orderedGroups,
} from "./model";

const command = (id: string, group: string, description = "") => ({
  id,
  title: id,
  description,
  group,
  run() {},
}) satisfies UiCommandItem;

describe("command palette model", () => {
  it("searches explanations as well as titles and keywords", () => {
    expect(filterCommands([
      command("Open graph", "Git", "Inspect repository commits"),
      command("New terminal", "Tabs", "Create a shell"),
    ], "commits").map((item) => item.id)).toEqual(["Open graph"]);
  });

  it("keeps known categories first and preserves unknown categories", () => {
    expect(orderedGroups([
      command("z", "Company"),
      command("a", "Git"),
      command("b", "Extension"),
    ])).toEqual(["Git", "Company", "Extension"]);
  });

  it("restores the baseline source order independently of plugin activation order", () => {
    const values = [
      { id: "rigs", order: 60, commands: () => [] },
      { ...command("preview", "Tabs"), order: 30 },
      { id: "workspace", order: 0, commands: () => [] },
      { id: "terminal", order: 10, commands: () => [] },
    ];

    expect(
      orderedCommandContributions(values).map((value) => value.id),
    ).toEqual(["workspace", "terminal", "preview", "rigs"]);
  });
});
