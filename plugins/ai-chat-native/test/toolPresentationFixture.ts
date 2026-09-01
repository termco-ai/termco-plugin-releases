import type { AiToolContribution } from "@termco/ai-tools-base";
import { configureToolContributions } from "../src/baseline/runtime/toolContributions";

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object"
    ? value as Record<string, unknown>
    : null;

function view(value: unknown): Record<string, unknown> | null {
  const candidate = record(value);
  if (!candidate) return null;
  switch (candidate.kind) {
    case "table":
      return Array.isArray(candidate.columns) && Array.isArray(candidate.rows)
        ? candidate
        : null;
    case "chart":
      return Array.isArray(candidate.series) ? candidate : null;
    case "diff":
      return candidate;
    case "findings":
    case "metrics":
    case "cards":
      return Array.isArray(candidate.items) ? candidate : null;
    case "tree":
      return Array.isArray(candidate.nodes) ? candidate : null;
    default:
      return null;
  }
}

/** Renderer tests exercise presentation, not provider validation. This fixture
 * crosses the same public contribution seam as a real selected profile. */
export function installToolPresentationFixture(): () => void {
  const contribution: AiToolContribution = {
    id: "renderer-test-presentations",
    group: "test",
    presentations: {
      ask_user: {
        renderer: "ask-user",
        interactive: true,
        parseInput(input) {
          const value = record(input);
          return value
            ? { ...value, options: Array.isArray(value.options) ? value.options : [] }
            : { question: "", options: [] };
        },
        parseOutput(output) {
          const value = record(output);
          return typeof value?.answer === "string" ? value : null;
        },
      },
      show_ui: {
        renderer: "structured-ui",
        interactive: false,
        parseInput(input) {
          const value = record(input);
          return view(value?.view) ? value : null;
        },
      },
      ask_ui: {
        renderer: "structured-ui",
        interactive: true,
        parseInput(input) {
          const value = record(input);
          if (!value || !view(value.view) || !Array.isArray(value.actions)) return null;
          const actions = value.actions.filter((action) => {
            const candidate = record(action);
            return typeof candidate?.id === "string" &&
              typeof candidate.label === "string";
          });
          return actions.length > 0 ? { ...value, actions } : null;
        },
        parseOutput(output) {
          const value = record(output);
          return typeof value?.label === "string" ? value : null;
        },
      },
      plugin_brief: {
        renderer: "plugin-brief",
        interactive: true,
        parseInput(input) {
          const value = record(input);
          return typeof value?.title === "string" ? value : null;
        },
        parseOutput(output) {
          const value = record(output);
          return typeof value?.action === "string" ? value : null;
        },
      },
    },
    build: () => ({}),
  };
  return configureToolContributions([contribution]);
}
