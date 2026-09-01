import type {
  UiCommandContribution,
  UiCommandItem,
  UiCommandRuntime,
} from "@termco/ui-commands-base";

const GROUP_ORDER = ["General", "Rigs", "Tabs", "Panes", "Git", "Search", "View", "Workflows", "AI"];

/** Restore the palette service's stable source ordering from the product
 * baseline. Capability activation order is an implementation detail and must
 * never decide where a plugin's commands appear. */
export function orderedCommandContributions<T extends { order?: number }>(
  values: readonly T[],
): T[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort(
      (left, right) =>
        (left.value.order ?? 0) - (right.value.order ?? 0) ||
        left.index - right.index,
    )
    .map(({ value }) => value);
}

export function collectCommandContributions(
  values: readonly UiCommandContribution[],
  runtime: UiCommandRuntime,
): UiCommandItem[] {
  return orderedCommandContributions(values).flatMap((value) => {
    try {
      return "commands" in value
        ? [...value.commands(runtime)]
        : [value];
    } catch (error) {
      console.error(
        `[command-palette] command source ${value.id} failed`,
        error,
      );
      return [];
    }
  });
}

function fuzzy(query: string, target: string): number | null {
  if (!query) return 0;
  const q = query.toLocaleLowerCase();
  const text = target.toLocaleLowerCase();
  let index = 0;
  let score = 0;
  let previous = -2;
  for (let cursor = 0; cursor < text.length && index < q.length; cursor++) {
    if (text[cursor] !== q[index]) continue;
    const boundary = cursor === 0 || " -_/.".includes(text[cursor - 1] ?? "");
    score += 1 + (boundary ? 8 : 0) + (cursor === previous + 1 ? 5 : 0);
    previous = cursor;
    index++;
  }
  return index === q.length ? score : null;
}

export function filterCommands(items: readonly UiCommandItem[], query: string): UiCommandItem[] {
  const term = query.trim();
  return items
    .map((item, index) => ({
      item,
      index,
      score: fuzzy(term, [item.title, item.description, item.group, ...(item.keywords ?? [])].join(" ")),
    }))
    .filter((entry): entry is typeof entry & { score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || (a.item.order ?? 0) - (b.item.order ?? 0) || a.index - b.index)
    .map((entry) => entry.item);
}

export function orderedGroups(items: readonly UiCommandItem[]): string[] {
  const present = new Set(items.map((item) => item.group || "Other"));
  return [
    ...GROUP_ORDER.filter((group) => present.delete(group)),
    ...[...present].sort((a, b) => a.localeCompare(b)),
  ];
}
