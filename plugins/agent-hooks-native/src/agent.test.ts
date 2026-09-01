/**
 * Agent spec/hooks/merge/commands tests (unix delivery paths).
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hooksStatusFor, writeHooks } from "./index";
import { conoutMarker, hookCommand, statusNeedle } from "./hooks";
import { mergeHooks } from "./merge";
import { find, settingsPath } from "./spec";

describe("agent/spec (parity)", () => {
  it("find_returns_each_registered_agent", () => {
    expect(find("claude").file).toBe("settings.json");
    expect(find("claude").delivery).toBe("terminalSequence");
    expect(find("codex").file).toBe("hooks.json");
    expect(find("codex").delivery).toBe("osc");
    expect(find("gemini").matcher).toBe(true);
  });

  it("every_agent_declares_three_lifecycle_events", () => {
    for (const a of ["claude", "codex", "gemini"]) {
      expect(find(a).events.map(([, m]) => m)).toEqual(["working", "attention", "finished"]);
    }
  });

  it("find_rejects_unknown_agent", () => {
    expect(() => find("copilot")).toThrow(/unknown agent copilot/);
  });

  it("settings_path_lives_under_home", () => {
    expect(settingsPath(find("claude")).endsWith(join(".claude", "settings.json"))).toBe(true);
  });
});

describe("agent/hooks (parity)", () => {
  it("conout_marker_is_the_osc777_notify_sequence", () => {
    expect(conoutMarker("codex", "working")).toBe("\x1b]777;notify;Termco;codex;working\x07");
  });

  it("claude_hook_returns_marker_via_terminal_sequence_field", () => {
    const cmd = hookCommand(find("claude"), "finished");
    expect(cmd).toContain('"terminalSequence"');
    expect(cmd).toContain("notify;Termco;finished");
    expect(cmd).toContain("TERMCO_TERMINAL");
  });

  it("codex_hook_writes_marker_to_dev_tty_and_prints_json_noop", () => {
    const cmd = hookCommand(find("codex"), "working");
    expect(cmd).toContain("/dev/tty");
    expect(cmd).toContain("notify;Termco;codex;working");
    expect(cmd.endsWith("printf '{}'")).toBe(true);
  });

  it("status_needle_is_substring_of_hook_command_for_every_event", () => {
    for (const a of ["claude", "codex", "gemini"]) {
      const spec = find(a);
      for (const [, event] of spec.events) {
        expect(hookCommand(spec, event)).toContain(statusNeedle(spec, event));
      }
    }
  });
});

describe("agent/merge (parity)", () => {
  const cmd = (root: Record<string, unknown>, event: string, idx: number): string =>
    ((((root.hooks as Record<string, unknown>)[event] as unknown[])[idx] as Record<string, unknown>)
      .hooks as Record<string, unknown>[])[0].command as string;
  const count = (root: Record<string, unknown>, event: string) =>
    ((root.hooks as Record<string, unknown>)[event] as unknown[]).length;

  it("claude_adds_all_event_hooks_to_empty_config", () => {
    const out = mergeHooks({}, find("claude"));
    expect(count(out, "UserPromptSubmit")).toBe(1);
    expect(count(out, "Stop")).toBe(1);
    expect(cmd(out, "Notification", 0)).toContain("notify;Termco;attention");
    expect(cmd(out, "Stop", 0)).toContain("terminalSequence");
    expect(cmd(out, "Stop", 0)).not.toContain("/dev/tty");
  });

  it("is_idempotent_per_agent", () => {
    for (const a of ["claude", "codex", "gemini"]) {
      const once = mergeHooks({}, find(a));
      const twice = mergeHooks(JSON.parse(JSON.stringify(once)), find(a));
      expect(twice).toEqual(once);
    }
  });

  it("codex_emits_four_field_dev_tty_marker", () => {
    const out = mergeHooks({}, find("codex"));
    expect(count(out, "PermissionRequest")).toBe(1);
    const stop = cmd(out, "Stop", 0);
    expect(stop).toContain("notify;Termco;codex;finished");
    expect(stop).toContain("> /dev/tty");
    expect(stop).not.toContain("terminalSequence");
  });

  it("gemini_uses_matcher_and_named_marker", () => {
    const out = mergeHooks({}, find("gemini"));
    const group = (((out.hooks as Record<string, unknown>).BeforeAgent as unknown[])[0]) as Record<string, unknown>;
    expect(group.matcher).toBe("*");
    expect(cmd(out, "AfterAgent", 0)).toContain("notify;Termco;gemini;finished");
  });
});

describe("agent/commands (parity)", () => {
  it("write_hooks_creates_config_when_absent + idempotent + status", () => {
    const dir = mkdtempSync(join(tmpdir(), "termco-agent-"));
    const path = join(dir, ".claude", "settings.json");
    const spec = find("claude");
    writeHooks(spec, path);
    const content = readFileSync(path, "utf8");
    expect(content).toContain("notify;Termco;working");
    expect(content).toContain("notify;Termco;finished");
    expect(hooksStatusFor(spec, content)).toBe(true);
    // idempotent
    writeHooks(spec, path);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(JSON.parse(content));
  });
});
