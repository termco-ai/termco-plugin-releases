import type {
  AiLibraryCapability,
  AiLibrarySkill,
} from "@termco/ai-library-base";
import type {
  AiToolContribution,
  AiToolDefinition,
} from "@termco/ai-tools-base";

function requestedName(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const value = (input as Record<string, unknown>).name;
  return typeof value === "string" ? value.trim() : "";
}

function isEnabled(
  skill: AiLibrarySkill,
  root: string | null,
  disabled: ReadonlySet<string>,
  projectEnabled: Readonly<Record<string, string[]>>,
): boolean {
  if (disabled.has(skill.id)) return false;
  if (skill.source.origin !== "project") return true;
  if (!root) return false;
  const enabled = projectEnabled[root] ?? [];
  return enabled.includes(skill.id) || enabled.includes(skill.name);
}

export function createSkillContribution(
  library: AiLibraryCapability,
): AiToolContribution {
  return {
    id: "skill",
    group: "core",
    order: 200,
    build(runtime) {
      const definition: AiToolDefinition = {
        description:
          "Activate one enabled skill from the Available Skills list and load its full instructions. Use the exact name. Pass an empty name to deactivate the current skill.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Exact enabled skill name, or an empty string to deactivate.",
            },
          },
          required: ["name"],
          additionalProperties: false,
        },
        async execute(input) {
          const name = requestedName(input);
          if (!name) return { ok: true, deactivated: true };
          const snapshot = await library.snapshot();
          const disabled = new Set(snapshot.disabledSkillIds);
          const root = runtime.getWorkspaceRoot?.() ?? null;
          const skill = snapshot.skills.find(
            (candidate) =>
              candidate.name === name &&
              isEnabled(
                candidate,
                root,
                disabled,
                snapshot.enabledProjectSkills,
              ),
          );
          if (!skill) {
            return {
              error: `unknown or disabled skill "${name}". Use a name exactly as listed under Available Skills.`,
            };
          }
          return {
            ok: true,
            skill: skill.name,
            instructions: skill.body,
            allowedGroups: skill.allowedGroups,
            model: skill.model,
          };
        },
      };
      return { skill: definition };
    },
  };
}
