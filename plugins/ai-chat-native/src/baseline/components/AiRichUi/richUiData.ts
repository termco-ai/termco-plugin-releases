/**
 * Tolerant readers over `show_ui` / `ask_ui` tool parts.
 *
 * The input streams in, so every reader must cope with a half-written object
 * and say "not ready" rather than render a broken view. Validation and
 * normalization come from the selected tool plugin's presentation adapter.
 */

import { toolsService } from "../../runtime/toolContributions";
import type { AskUiOutput, UiAction, ViewSpec } from "./types";

export type ShowUiInput = { view: ViewSpec };
export type AskUiInput = ShowUiInput & {
  question?: string;
  actions: UiAction[];
  allowNote?: boolean;
  selectable?: boolean;
};

export function readShowUi(toolName: string, input: unknown): ShowUiInput | null {
  const parsed = toolsService.presentation(toolName)?.parseInput(input);
  return parsed && typeof parsed === "object" ? parsed as ShowUiInput : null;
}

export function readAskUi(toolName: string, input: unknown): AskUiInput | null {
  const parsed = toolsService.presentation(toolName)?.parseInput(input);
  return parsed && typeof parsed === "object" ? parsed as AskUiInput : null;
}

export function readAskUiOutput(toolName: string, part: {
  state?: string;
  output?: unknown;
}): AskUiOutput | null {
  if (part.state !== "output-available") return null;
  const parsed = toolsService.presentation(toolName)?.parseOutput?.(part.output);
  return parsed && typeof parsed === "object" ? parsed as AskUiOutput : null;
}
