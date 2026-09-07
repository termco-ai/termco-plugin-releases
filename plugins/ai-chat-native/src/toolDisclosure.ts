import type { AiToolEntry } from "@termco/ai-tools-base";

const DEFAULT_EAGER_TOOL_NAMES = new Set([
  "read_file",
  "list_directory",
  "grep",
  "glob",
  "bash_run",
]);

const MAX_CAPABILITY_INDEX_CHARS = 2_400;
const MAX_CAPABILITY_SUMMARY_CHARS = 180;
const MAX_PRIMED_TOOLS = 3;

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

export type ToolDiscoveryCapability = {
  id: string;
  group: string;
  toolNames: readonly string[];
  summary?: string;
  activationPhrases?: Readonly<Record<string, readonly string[]>>;
};

export interface ToolDisclosure {
  readonly catalogSize: number;
  readonly toolSearchDefinition: AiToolEntry;
  activeToolNames(additionalPreferredGroups?: readonly string[]): string[];
  prime(request: string): string[];
  search(query: string, limit?: number): ToolSearchResult;
  telemetry(): {
    catalogSize: number;
    eagerCount: number;
    deferredCount: number;
    loadedCount: number;
    primedCount: number;
    searches: number;
    zeroMatchSearches: number;
  };
}

type Input = {
  definitions: Readonly<Record<string, AiToolEntry>>;
  groups: ReadonlyMap<string, string>;
  preferredGroups?: readonly string[];
  hiddenGroups?: readonly string[];
  capabilities?: readonly ToolDiscoveryCapability[];
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

function compactText(value: string, limit: number): string {
  const compact = value.replace(/\s+/gu, " ").trim();
  return compact.length <= limit ? compact : `${compact.slice(0, limit - 1)}…`;
}

function containsPhrase(requestWords: readonly string[], phrase: string): boolean {
  const phraseWords = words(phrase);
  if (phraseWords.length === 0 || phraseWords.length > requestWords.length) return false;
  return requestWords.some((_, start) =>
    phraseWords.every((word, offset) => requestWords[start + offset] === word)
  );
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
  const primed = new Set<string>();
  let searches = 0;
  let zeroMatchSearches = 0;
  const allowedCapabilities = (input.capabilities ?? []).flatMap((capability) => {
    if (hiddenGroups.has(capability.group)) return [];
    const toolNames = capability.toolNames.filter((name) => input.definitions[name]);
    return toolNames.length > 0 ? [{ ...capability, toolNames }] : [];
  });
  const discoveryTextByTool = new Map<string, string[]>();
  for (const capability of allowedCapabilities) {
    const summary = capability.summary?.trim();
    for (const name of capability.toolNames) {
      const phrases = capability.activationPhrases?.[name] ?? [];
      discoveryTextByTool.set(name, [summary ?? "", ...phrases]);
    }
  }
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
        ...(discoveryTextByTool.get(name) ?? []),
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

  const initiallyActive = (entry: CatalogEntry) =>
    entry.group === "core" ||
    DEFAULT_EAGER_TOOL_NAMES.has(entry.name) ||
    preferredGroups.has(entry.group);
  const catalogByName = new Map(catalog.map((entry) => [entry.name, entry]));
  const deferredToolNamesByGroup = new Map<string, string[]>();
  for (const entry of catalog) {
    if (initiallyActive(entry)) continue;
    const names = deferredToolNamesByGroup.get(entry.group) ?? [];
    names.push(entry.name);
    deferredToolNamesByGroup.set(entry.group, names);
  }

  const groups = new Map<string, { summaries: string[]; toolNames: string[] }>();
  for (const capability of allowedCapabilities) {
    const deferredNames = capability.toolNames.filter((name) => {
      const entry = catalogByName.get(name);
      return entry && !initiallyActive(entry);
    });
    if (deferredNames.length === 0) continue;
    const current = groups.get(capability.group) ?? { summaries: [], toolNames: [] };
    if (capability.summary?.trim()) current.summaries.push(capability.summary);
    current.toolNames.push(...deferredNames);
    groups.set(capability.group, current);
  }
  for (const [group, toolNames] of deferredToolNamesByGroup) {
    if (groups.has(group)) continue;
    groups.set(group, { summaries: [], toolNames });
  }
  const capabilityLines = [...groups.entries()].map(([group, details]) => {
    const uniqueSummaries = [...new Set(details.summaries.map((summary) =>
      compactText(summary, MAX_CAPABILITY_SUMMARY_CHARS)
    ))];
    const fallback = [...new Set(details.toolNames)].slice(0, 4).join(", ");
    return `- ${group}: ${uniqueSummaries.join(" ") || fallback}`;
  });
  const overflowLine = "- More authorized capabilities are searchable by desired outcome.";
  let capabilityIndex = "";
  let truncatedCapabilities = false;
  for (const [index, line] of capabilityLines.entries()) {
    const candidate = capabilityIndex ? `${capabilityIndex}\n${line}` : line;
    const needsOverflowLine = index < capabilityLines.length - 1;
    const reservedLength = needsOverflowLine ? overflowLine.length + 1 : 0;
    if (candidate.length + reservedLength > MAX_CAPABILITY_INDEX_CHARS) {
      truncatedCapabilities = true;
      break;
    }
    capabilityIndex = candidate;
  }
  if (capabilityIndex && truncatedCapabilities) {
    capabilityIndex += `\n${overflowLine}`;
  }

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

  const prime = (request: string): string[] => {
    const requestWords = words(request);
    if (requestWords.length === 0) return [];
    const matched: string[] = [];
    for (const capability of allowedCapabilities) {
      for (const [name, phrases] of Object.entries(
        capability.activationPhrases ?? {},
      )) {
        if (
          matched.length >= MAX_PRIMED_TOOLS ||
          primed.has(name) ||
          !availableNames.has(name) ||
          !capability.toolNames.includes(name) ||
          !phrases.some((phrase) => containsPhrase(requestWords, phrase))
        ) continue;
        loaded.add(name);
        primed.add(name);
        matched.push(name);
      }
    }
    return matched;
  };

  const toolSearchDefinition: AiToolEntry = {
    description: [
      "Search the complete authorized tool catalog and load the most relevant exact schemas for the next step. The list below is a compact capability index, not the complete schemas. Search before claiming a capability is unavailable, improvising with shell commands, or falling back to Markdown when a native presentation fits. Discovery never executes a tool and never requires approval.",
      capabilityIndex ? `Currently deferred capability families:\n${capabilityIndex}` : "All authorized capability families are already visible.",
    ].join("\n\n"),
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
    prime,
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
        primedCount: primed.size,
        searches,
        zeroMatchSearches,
      };
    },
  };
}
