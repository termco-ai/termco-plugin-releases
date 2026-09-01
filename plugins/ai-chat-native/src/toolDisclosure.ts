import type { AiToolEntry } from "@termco/ai-tools-base";

const DEFAULT_EAGER_TOOL_NAMES = new Set([
  "read_file",
  "list_directory",
  "grep",
  "glob",
  "bash_run",
]);

export const TOOL_SEARCH_NAME = "tool_search";

export type ToolSearchMatch = {
  name: string;
  group: string;
  description: string;
};

export type ToolSearchResult = {
  query: string;
  matches: ToolSearchMatch[];
  loaded: string[];
};

export interface ToolDisclosure {
  readonly catalogSize: number;
  readonly toolSearchDefinition: AiToolEntry;
  activeToolNames(additionalPreferredGroups?: readonly string[]): string[];
  search(query: string, limit?: number): ToolSearchResult;
  telemetry(): {
    catalogSize: number;
    eagerCount: number;
    deferredCount: number;
    loadedCount: number;
    searches: number;
    zeroMatchSearches: number;
  };
}

type Input = {
  definitions: Readonly<Record<string, AiToolEntry>>;
  groups: ReadonlyMap<string, string>;
  preferredGroups?: readonly string[];
  hiddenGroups?: readonly string[];
};

type CatalogEntry = ToolSearchMatch & {
  searchText: string;
  tokens: readonly string[];
  termFrequency: ReadonlyMap<string, number>;
};

function words(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

function schemaSearchText(value: unknown, depth = 0): string[] {
  if (depth > 12 || value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => schemaSearchText(entry, depth + 1));
  }
  if (typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => [
    key,
    ...schemaSearchText(entry, depth + 1),
  ]);
}

function score(
  entry: CatalogEntry,
  query: string,
  queryWords: readonly string[],
  documentFrequency: ReadonlyMap<string, number>,
  documentCount: number,
  averageLength: number,
): number {
  const name = entry.name.toLocaleLowerCase();
  const group = entry.group.toLocaleLowerCase();
  const normalized = query.toLocaleLowerCase().trim();
  let total = name === normalized ? 200 : name.includes(normalized) ? 80 : 0;
  if (group === normalized) total += 50;
  for (const word of new Set(queryWords)) {
    if (name.includes(word)) total += 24;
    if (group.includes(word)) total += 14;
    const frequency = entry.termFrequency.get(word) ?? 0;
    if (frequency === 0) continue;
    const containingDocuments = documentFrequency.get(word) ?? 0;
    const inverseDocumentFrequency = Math.log(
      1 + (documentCount - containingDocuments + 0.5) /
        (containingDocuments + 0.5),
    );
    const lengthNormalization = 1 - 0.75 +
      0.75 * (entry.tokens.length / Math.max(1, averageLength));
    total += inverseDocumentFrequency *
      ((frequency * 2.2) / (frequency + 1.2 * lengthNormalization)) * 10;
  }
  return total;
}

export function createToolDisclosure(input: Input): ToolDisclosure {
  const preferredGroups = new Set(input.preferredGroups ?? []);
  const hiddenGroups = new Set(input.hiddenGroups ?? []);
  const loaded = new Set<string>();
  let searches = 0;
  let zeroMatchSearches = 0;
  const catalog = Object.entries(input.definitions)
    .filter((entry): entry is [string, AiToolEntry] => Boolean(entry[1]))
    .flatMap(([name, definition]): CatalogEntry[] => {
      const group = input.groups.get(name) ?? "uncategorized";
      if (hiddenGroups.has(group)) return [];
      const description = definition.description ?? "";
      const searchText = [
        name,
        group,
        description,
        ...schemaSearchText(definition.inputSchema),
      ].join(" ");
      const tokens = words(searchText);
      const termFrequency = new Map<string, number>();
      for (const token of tokens) {
        termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
      }
      return [{
        name,
        group,
        description,
        searchText: searchText.toLocaleLowerCase(),
        tokens,
        termFrequency,
      }];
    });
  const availableNames = new Set(catalog.map((entry) => entry.name));
  const documentFrequency = new Map<string, number>();
  for (const entry of catalog) {
    for (const token of new Set(entry.tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  const averageLength = catalog.length === 0
    ? 1
    : catalog.reduce((total, entry) => total + entry.tokens.length, 0) /
      catalog.length;

  const search = (rawQuery: string, rawLimit = 5): ToolSearchResult => {
    const query = rawQuery.trim();
    const queryWords = words(query);
    const limit = Math.max(1, Math.min(10, Math.trunc(rawLimit) || 5));
    if (queryWords.length === 0) return { query, matches: [], loaded: [] };
    searches += 1;
    const matches = catalog
      .map((entry) => ({
        entry,
        score: score(
          entry,
          query,
          queryWords,
          documentFrequency,
          catalog.length,
          averageLength,
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) =>
        right.score - left.score || left.entry.name.localeCompare(right.entry.name)
      )
      .slice(0, limit)
      .map(({ entry }) => ({
        name: entry.name,
        group: entry.group,
        description: entry.description,
      }));
    if (matches.length === 0) zeroMatchSearches += 1;
    for (const match of matches) loaded.add(match.name);
    return { query, matches, loaded: matches.map((match) => match.name) };
  };

  const toolSearchDefinition: AiToolEntry = {
    description:
      "Search the complete authorized tool catalog and load the most relevant exact tool schemas for the next step. Use this whenever the directly visible tools do not cover the task. Discovery never executes a tool and never requires approval.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          maxLength: 300,
          description: "Describe the capability or operation you need.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          description: "Maximum exact tool schemas to load. Defaults to 5.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    execute(rawInput) {
      const values = rawInput && typeof rawInput === "object"
        ? rawInput as Record<string, unknown>
        : {};
      return search(
        typeof values.query === "string" ? values.query : "",
        typeof values.limit === "number" ? values.limit : 5,
      );
    },
  };

  return {
    catalogSize: catalog.length,
    toolSearchDefinition,
    activeToolNames(additionalPreferredGroups = []) {
      const activePreferredGroups = new Set([
        ...preferredGroups,
        ...additionalPreferredGroups,
      ]);
      return catalog
        .filter((entry) =>
          entry.group === "core" ||
          DEFAULT_EAGER_TOOL_NAMES.has(entry.name) ||
          activePreferredGroups.has(entry.group) ||
          loaded.has(entry.name)
        )
        .map((entry) => entry.name)
        .concat(TOOL_SEARCH_NAME)
        .filter((name) => name === TOOL_SEARCH_NAME || availableNames.has(name));
    },
    search,
    telemetry() {
      const eagerCount = catalog.filter((entry) =>
        entry.group === "core" ||
        DEFAULT_EAGER_TOOL_NAMES.has(entry.name) ||
        preferredGroups.has(entry.group)
      ).length + 1;
      return {
        catalogSize: catalog.length,
        eagerCount,
        deferredCount: Math.max(0, catalog.length - eagerCount + 1),
        loadedCount: loaded.size,
        searches,
        zeroMatchSearches,
      };
    },
  };
}
