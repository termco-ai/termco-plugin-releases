import type {
  PluginCatalogItem,
  PluginAuthoringProfileApi,
} from "@termco/profile-base";
import type { AiToolRuntime } from "@termco/ai-tools-base";
import type { UiContributionEvidenceCapability } from "@termco/ui-shell-base";
import type { UiChangeRevealCapability } from "@termco/ui-change-reveal-base";
import type { OnboardingRegistry } from "@termco/onboarding-base";
import type { OptionalCapability } from "@termco/kernel";
import { describe, expect, it, vi } from "vitest";
import {
  createPluginDevelopmentContribution,
  createPluginDevelopmentTools,
  searchCatalog,
} from "./tools";

const catalog: PluginCatalogItem[] = [{
  id: "header-native",
  name: "Application Header",
  description: "Composes header contributions.",
  category: "Chrome & Tools",
  version: "1.0.0",
  sourceFolder: "plugins/header-native",
  sourceType: "bundled",
  editable: false,
  userInstalled: false,
  selectedBy: "termco.default",
  whyLoaded: "Selected by the default profile.",
  provides: [{
    id: "ui.shell.header",
    version: "1.0.0",
    description: "Header composition.",
    cardinality: "exclusive",
    providers: ["header-native"],
  }],
  consumes: [],
  permissions: ["ui.render"],
  processes: ["renderer"],
}];

function profile(): PluginAuthoringProfileApi {
  return {
    catalog: () => catalog,
    subscribe: () => () => {},
    profileSnapshot: vi.fn(async () => ({ activeProfileId: "termco.default", profiles: [] })),
    exportProfile: vi.fn(async () => ({ status: "cancelled" as const })),
    importProfile: vi.fn(async () => ({ status: "cancelled" as const })),
    listDrafts: vi.fn(async () => []),
    plan: vi.fn(async (request) => ({
      ...request,
      planId: `plan-${request.plugin.id}`,
    })),
    listSourceFiles: vi.fn(async () => ["src/renderer.tsx", "termco-plugin.json"]),
    readSourceFile: vi.fn(async () => "source"),
    writeSourceFile: vi.fn(async () => {}),
    create: vi.fn(async (planId: string) => ({
      status: "draft" as const,
      pluginId: planId.replace(/^plan-/, ""),
      sourceFolder: `/plugins/${planId.replace(/^plan-/, "")}`,
      stages: {
        scaffolded: true,
        validated: true,
        compiled: true,
        profileCommitted: false,
        graphSettled: false,
        contributionRegistered: null,
        visiblyVerified: false,
      },
    })),
    fork: vi.fn(async (planId: string) => ({
      status: "forked" as const,
      pluginId: planId.replace(/^plan-/, ""),
      sourceFolder: `/plugins/${planId.replace(/^plan-/, "")}`,
    })),
    copyAndReplace: vi.fn(async (planId: string) => ({
      status: "draft" as const,
      pluginId: planId.replace(/^plan-/, ""),
      sourceFolder: `/plugins/${planId.replace(/^plan-/, "")}`,
      generation: null,
      completionId: null,
    })),
    apply: vi.fn(async (pluginId: string) => ({
      status: "replaced" as const,
      pluginId,
      sourceFolder: `/plugins/${pluginId}`,
      generation: `sha256-${pluginId}`,
      completionId: `completion-${pluginId}`,
    })),
    undo: vi.fn(async (completionId: string) => ({
      status: "replaced" as const,
      completionId,
      pluginId: "floating-calculator-fab",
    })),
    openPluginFolder: vi.fn(async (pluginId: string) => ({
      path: `/plugins/${pluginId}`,
    })),
    uninstall: vi.fn(async (pluginId: string) => ({
      status: "uninstalled" as const,
      pluginId,
      sourceFolder: `/plugins/${pluginId}`,
      movedToTrash: true,
    })),
    previewSetEnabled: vi.fn(async (pluginId: string, enabled: boolean) => ({
      previewId: "preview-1",
      generation: 1,
      pluginId,
      enabled,
      blockedPlugins: [],
      unavailableFeatures: [],
      degradedPlugins: [],
      destructiveResources: [],
    })),
    setEnabled: vi.fn(async (pluginId: string, enabled: boolean) => ({
      status: "replaced" as const,
      pluginId,
      enabled,
    })),
    activate: vi.fn(async (profileId: string) => ({
      status: "replaced" as const,
      profileId,
    })),
  };
}

function evidence(): UiContributionEvidenceCapability {
  return {
    snapshot: () => [],
    subscribe: () => () => {},
    verify: vi.fn(async (input) => ({
      ok: true,
      pluginId: input.pluginId,
      generation: input.generation,
      refs: [],
      completedStages: ["contribution-registered"] as const,
      message: "verified",
    })),
  };
}

function reveal(): UiChangeRevealCapability {
  return {
    reveal: vi.fn(async (request) => ({
      status: "revealed" as const,
      target: request.target,
      message: "revealed",
    })),
  };
}

function onboarding(
  options: { includeJourney?: boolean; includeTarget?: boolean } = {},
): OptionalCapability<OnboardingRegistry> {
  const includeJourney = options.includeJourney ?? true;
  const includeTarget = options.includeTarget ?? true;
  const registry: OnboardingRegistry = {
    register: vi.fn(() => () => {}),
    subscribe: () => () => {},
    records: () => [{
      pluginId: "floating-calculator-fab",
      generation: "sha256-floating-calculator-fab",
      key: "floating-calculator-fab-onboarding",
      value: {
        id: "floating-calculator-fab-onboarding",
        journeys: includeJourney ? [{
          id: "floating-calculator-fab-getting-started",
          title: "Try the floating calculator",
          description: "Open the calculator and see its result without leaving the workspace.",
          presentation: "contextual",
          steps: [{
            id: "open-calculator",
            version: 1,
            title: "Open the calculator",
            kind: "interaction",
            scope: { kind: "user" },
            targetId: "calculator-button",
            expectation: { kind: "click" },
            body: { markdown: "Choose Calculator to open the floating panel." },
          }],
        }] : [],
        targets: includeTarget ? [{
          id: "calculator-button",
          label: "Calculator",
          reveal: vi.fn(async () => ({
            element: {} as HTMLElement,
            dispose: () => {},
          })),
        }] : [],
      },
    }],
  };
  return { current: () => registry, subscribe: () => () => {} };
}

const overlayAuthoring = {
    intent: "create",
    plugin: {
      id: "floating-calculator-fab",
      name: "Floating Calculator FAB",
      description: "Adds a global calculator overlay.",
      category: "Interface",
    },
    target: "ui.overlays",
    contributions: [{
      contribution: { service: "ui.overlays", key: "calculator-fab" },
      present: true,
      visibleTarget: { role: "button", name: "Calculator" },
    }],
    reveal: "auto",
} as const;

const overlayOnboarding = {
  decision: "include",
  rationale: "The floating control is visible but its fact-card interaction is new.",
  journey: {
    id: "floating-calculator-fab-getting-started",
    title: "Try the floating calculator",
    description: "Open the calculator and see its result without leaving the workspace.",
    presentation: "contextual",
    steps: [{
      id: "open-calculator",
      version: 1,
      title: "Open the calculator",
      kind: "interaction",
      instruction: "Choose Calculator to open the floating panel.",
      targetId: "calculator-button",
      expectation: { kind: "click" },
    }],
  },
} as const;

function briefInput(
  authoring: unknown = overlayAuthoring,
  onboardingDecision: unknown = overlayOnboarding,
) {
  return {
    revision: 1,
    title: "Floating Calculator",
    outcome: "A calculator is available without leaving the workspace.",
    userJourney: "The developer opens it while working and returns to the same task.",
    experience: {
      location: "A global floating control",
      interaction: "Open, calculate, and close the calculator.",
      states: ["Closed", "Open", "Result shown"],
    },
    scope: { included: ["Basic calculations"], excluded: ["History sync"] },
    acceptanceCriteria: ["The Calculator button opens the owned overlay."],
    onboarding: onboardingDecision,
    authoring,
  };
}

function confirmedRuntime(
  authoring: unknown = overlayAuthoring,
  output: unknown = { action: "confirm" },
  callId = "brief-overlay",
  onboardingDecision: unknown = overlayOnboarding,
): AiToolRuntime {
  return {
    getSessionId: () => "session-plugin-test",
    getLatestCompletedToolCall: vi.fn(async () => ({
      callId,
      input: briefInput(authoring, onboardingDecision) as never,
      output: output as never,
    })),
  };
}

function overlayTools(
  api = profile(),
  proof = evidence(),
  changeReveal = reveal(),
) {
  return createPluginDevelopmentTools(
    api,
    proof,
    changeReveal,
    undefined,
    confirmedRuntime(),
    onboarding(),
  );
}

async function prepareOverlayDraft(
  tools: ReturnType<typeof createPluginDevelopmentTools>,
) {
  const plan = await tools.plugin_plan.execute({}) as {
    planId: string;
  };
  await tools.plugin_create.execute({ planId: plan.planId });
  return plan;
}

describe("AI Tools: Plugin Development", () => {
  it("publishes the plugin-dev group", () => {
    expect(createPluginDevelopmentContribution(profile(), evidence(), reveal())).toMatchObject({
      id: "plugin-dev",
      group: "plugin-dev",
      order: 10,
    });
  });

  it("searches descriptions, categories, and capability explanations", () => {
    expect(searchCatalog(catalog, "header composition", "Chrome & Tools"))
      .toEqual(catalog);
    expect(searchCatalog(catalog, "terminal")).toEqual([]);
  });

  it("owns the complete whole-folder edit loop", () => {
    expect(Object.keys(createPluginDevelopmentTools(profile(), evidence(), reveal())).sort()).toEqual([
      "plugin_activation_preview",
      "plugin_apply",
      "plugin_brief",
      "plugin_capabilities",
      "plugin_catalog",
      "plugin_copy_and_replace",
      "plugin_create",
      "plugin_fork",
      "plugin_open_folder",
      "plugin_plan",
      "plugin_reveal_change",
      "plugin_set_enabled",
      "plugin_source_list",
      "plugin_source_read",
      "plugin_source_write",
      "plugin_undo",
      "plugin_verify",
    ]);
  });

  it("publishes a dedicated interactive Plugin Brief presentation", () => {
    const contribution = createPluginDevelopmentContribution(
      profile(),
      evidence(),
      reveal(),
    );
    expect(contribution.presentations?.plugin_brief).toMatchObject({
      renderer: "plugin-brief",
      interactive: true,
    });
    expect(contribution.presentations?.plugin_brief.parseInput(
      briefInput(),
    )).toMatchObject({ title: "Floating Calculator", revision: 1 });
    expect(contribution.presentations?.plugin_brief.parseOutput?.({
      action: "confirm",
    })).toEqual({ action: "confirm" });
  });

  it("hard-gates planning on the latest confirmed Plugin Brief", async () => {
    const revised = createPluginDevelopmentTools(
      profile(),
      evidence(),
      reveal(),
      undefined,
      confirmedRuntime(overlayAuthoring, {
        action: "revise",
        note: "Put it in the sidebar instead.",
      }),
    );
    await expect(revised.plugin_plan.execute({}))
      .rejects.toThrow("was not confirmed");

    const missing = createPluginDevelopmentTools(
      profile(),
      evidence(),
      reveal(),
      undefined,
      {
        getSessionId: () => "session-plugin-test",
        getLatestCompletedToolCall: vi.fn(async () => null),
      },
    );
    await expect(missing.plugin_plan.execute({}))
      .rejects.toThrow("latest Plugin Brief is missing");
  });

  it("plans from the latest confirmed brief without requiring its hidden tool-call id", async () => {
    const api = profile();
    const tools = overlayTools(api);
    expect(tools.plugin_plan.inputSchema).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false,
    });

    await expect(tools.plugin_plan.execute({})).resolves.toMatchObject({
      briefCallId: "brief-overlay",
      intent: "create",
    });
    expect(api.plan).toHaveBeenCalledWith({
      ...overlayAuthoring,
      onboarding: overlayOnboarding,
    });
  });

  it("derives one idempotent technical plan from confirmed brief data", async () => {
    const api = profile();
    const tools = overlayTools(api);
    const first = await tools.plugin_plan.execute({});
    const second = await tools.plugin_plan.execute({});

    expect(second).toEqual(first);
    expect(api.plan).toHaveBeenCalledTimes(1);
    expect(api.plan).toHaveBeenCalledWith({
      ...overlayAuthoring,
      onboarding: overlayOnboarding,
    });
  });

  it("requires every new Plugin Brief to resolve onboarding explicitly", () => {
    const tools = createPluginDevelopmentTools(profile(), evidence(), reveal());
    const schema = tools.plugin_brief.inputSchema as {
      required: readonly string[];
      properties: { onboarding: { oneOf: readonly unknown[] } };
    };

    expect(schema.required).toContain("onboarding");
    expect(schema.properties.onboarding.oneOf).toHaveLength(3);
  });

  it("rejects a legacy confirmed brief that has no onboarding decision", async () => {
    const legacy = briefInput() as Record<string, unknown>;
    delete legacy.onboarding;
    const tools = createPluginDevelopmentTools(
      profile(),
      evidence(),
      reveal(),
      undefined,
      {
        getLatestCompletedToolCall: vi.fn(async () => ({
          callId: "legacy-brief",
          input: legacy as never,
          output: { action: "confirm" } as never,
        })),
      },
    );

    await expect(tools.plugin_plan.execute({})).rejects.toThrow(
      "onboarding decision",
    );
  });

  it("derives a fresh plan when a newer confirmed Plugin Brief supersedes it", async () => {
    const api = profile();
    const getLatestCompletedToolCall = vi.fn(async () => ({
      callId: "brief-overlay",
      input: briefInput() as never,
      output: { action: "confirm" } as never,
    }));
    const tools = createPluginDevelopmentTools(
      api,
      evidence(),
      reveal(),
      undefined,
      { getSessionId: () => "session-plugin-test", getLatestCompletedToolCall },
    );

    await tools.plugin_plan.execute({});
    getLatestCompletedToolCall.mockResolvedValue({
      callId: "brief-newer",
      input: briefInput() as never,
      output: { action: "confirm" } as never,
    });

    await expect(tools.plugin_plan.execute({})).resolves.toMatchObject({
      briefCallId: "brief-newer",
    });
    expect(api.plan).toHaveBeenCalledTimes(2);
  });

  it("only advertises authoring variants that exist in the generated capability catalog", () => {
    const tools = createPluginDevelopmentTools(profile(), evidence(), reveal());
    const schema = tools.plugin_brief.inputSchema as {
      properties: { authoring: { properties: { variant: { enum?: readonly string[] } } } };
    };

    expect(schema.properties.authoring.properties.variant.enum?.slice().sort()).toEqual([
      "center",
      "leading",
      "left",
      "right",
      "tabs",
      "trailing",
      "workspaces",
    ]);
  });

  it("only advertises semantic roles the verifier can actually observe", () => {
    const tools = createPluginDevelopmentTools(profile(), evidence(), reveal());
    const schema = tools.plugin_brief.inputSchema as {
      properties: {
        authoring: { properties: { contributions: {
          items: { properties: {
              visibleTarget: { properties: { role: { enum?: readonly string[] } } };
              actions: {
                items: {
                  oneOf: readonly [unknown, {
                    properties: {
                      target: { properties: { role: { enum?: readonly string[] } } };
                    };
                  }];
                };
              };
              after: {
                items: {
                  oneOf: readonly [unknown, {
                    properties: { role: { enum?: readonly string[] } };
                  }];
                };
              };
            };
          } };
        } };
      };
    };
    const contribution = schema.properties.authoring.properties.contributions.items.properties;
    const roleLists = [
      contribution.visibleTarget.properties.role.enum,
      contribution.actions.items.oneOf[1].properties.target.properties.role.enum,
      contribution.after.items.oneOf[1].properties.role.enum,
    ];

    for (const roles of roleLists) {
      expect(roles).toContain("button");
      expect(roles).toContain("heading");
      expect(roles).toContain("status");
      expect(roles).not.toContain("text");
    }
  });

  it("discovers the overlay contract and lifecycle-safe registry usage", () => {
    const tools = createPluginDevelopmentTools(profile(), evidence(), reveal());
    expect(tools.plugin_capabilities.execute({ query: "global overlay" })).toMatchObject({
      capabilities: [{
        service: "ui.overlays",
        contractPackage: "@termco/ui-overlays-base",
      }],
      manifest: { schemaVersion: 3 },
    });
  });

  it("discovers every renderer contribution seam from the shell contract", () => {
    const tools = createPluginDevelopmentTools(profile(), evidence(), reveal());
    const result = tools.plugin_capabilities.execute({}) as {
      capabilities: Array<{ service: string }>;
    };

    expect(result.capabilities.map((entry) => entry.service).sort()).toEqual([
      "ui.ai-dock.views",
      "ui.background.tasks",
      "ui.commands",
      "ui.dock.surfaces",
      "ui.header.items",
      "ui.overlays",
      "ui.providers",
      "ui.settings.sections",
      "ui.sidebar.views",
      "ui.statusbar.items",
      "ui.tabs.kinds",
      "ui.workspace.footer",
      "ui.workspace.views",
    ]);
  });

  it("grounds a left-sidebar icon in the owning sidebar contract", () => {
    const tools = createPluginDevelopmentTools(profile(), evidence(), reveal());

    expect(tools.plugin_capabilities.execute({
      query: "left sidebar icon",
    })).toMatchObject({
      capabilities: [{
        service: "ui.sidebar.views",
        contractPackage: "@termco/ui-sidebar-base",
        serviceConstant: "UI_SIDEBAR_VIEWS_SERVICE",
        registryType: "UiSidebarViewRegistry",
        contributionType: "UiSidebarViewContribution",
      }],
    });
  });

  it("returns a full exact contract before the creator mutates a plugin", () => {
    const tools = createPluginDevelopmentTools(profile(), evidence(), reveal());

    expect(tools.plugin_capabilities.execute({
      exactId: "ui.sidebar.views",
    })).toMatchObject({
      mode: "exact",
      capabilities: [{
        service: "ui.sidebar.views",
        requiredFields: ["id", "label", "description", "icon", "Component"],
        collisionPolicy: expect.stringContaining("unique"),
        verification: expect.objectContaining({
          target: "sidebar rail button",
          postcondition: "the contributed view is selected and mounted",
        }),
        reveal: "sidebar-view",
      }],
    });
  });

  it("allows reveal only after apply and generation-scoped semantic verification", async () => {
    const api = profile();
    const proof = evidence();
    vi.mocked(proof.verify).mockImplementation(async (input) => ({
      ok: true,
      pluginId: input.pluginId,
      generation: input.generation,
      refs: [{
        service: "ui.overlays",
        pluginId: input.pluginId,
        generation: input.generation,
        key: "calculator-fab",
        contributionId: "calculator-fab",
      }],
      completedStages: ["contribution-registered"],
      message: "verified",
    }));
    const changeReveal = reveal();
    const tools = overlayTools(api, proof, changeReveal);
    await prepareOverlayDraft(tools);
    await tools.plugin_apply.execute({ pluginId: "floating-calculator-fab" });
    const input = {
      completionId: "completion-floating-calculator-fab",
    };

    await expect(tools.plugin_verify.execute(input)).resolves.toMatchObject({
      kind: "plugin-completion",
      status: "verified",
      plugin: {
        id: "floating-calculator-fab",
        name: "Floating Calculator FAB",
        intent: "create",
        target: "ui.overlays",
      },
      actions: ["show-again", "open-folder", "disable", "undo"],
      ok: true,
      generation: "sha256-floating-calculator-fab",
      onboarding: {
        ok: true,
        decision: "include",
        journeyId: "floating-calculator-fab-getting-started",
      },
    });
    expect(proof.verify).toHaveBeenCalledWith({
      pluginId: "floating-calculator-fab",
      generation: "sha256-floating-calculator-fab",
      expectations: [{
        contribution: { service: "ui.overlays", key: "calculator-fab" },
        present: true,
        visibleTarget: { role: "button", name: "Calculator" },
      }],
    });
    await expect(tools.plugin_reveal_change.execute({
      completionId: "completion-floating-calculator-fab",
      mode: "show-and-spotlight",
      announcement: "Calculator was added as a floating control.",
    })).resolves.toMatchObject({
      completionId: "completion-floating-calculator-fab",
      results: [{ status: "revealed" }],
    });
    expect(changeReveal.reveal).toHaveBeenCalledWith({
      target: expect.objectContaining({
        pluginId: "floating-calculator-fab",
        generation: "sha256-floating-calculator-fab",
        service: "ui.overlays",
      }),
      mode: "show-and-spotlight",
      announcement: "Calculator was added as a floating control.",
    });
  });

  it("fails verification when an included onboarding target is not plugin-owned", async () => {
    const api = profile();
    const tools = createPluginDevelopmentTools(
      api,
      evidence(),
      reveal(),
      undefined,
      confirmedRuntime(),
      onboarding({ includeTarget: false }),
    );
    await prepareOverlayDraft(tools);
    await tools.plugin_apply.execute({ pluginId: "floating-calculator-fab" });

    await expect(tools.plugin_verify.execute({
      completionId: "completion-floating-calculator-fab",
    })).resolves.toMatchObject({
      ok: false,
      decision: "include",
      message: expect.stringContaining("calculator-button"),
    });
  });

  it("verifies that an omitted journey was not invented by the live plugin", async () => {
    const omitted = {
      decision: "omit",
      rationale: "The user chose to skip onboarding.",
    } as const;
    const run = async (includeJourney: boolean) => {
      const tools = createPluginDevelopmentTools(
        profile(),
        evidence(),
        reveal(),
        undefined,
        confirmedRuntime(overlayAuthoring, { action: "confirm" }, "brief-omit", omitted),
        onboarding({ includeJourney }),
      );
      await prepareOverlayDraft(tools);
      await tools.plugin_apply.execute({ pluginId: "floating-calculator-fab" });
      return tools.plugin_verify.execute({
        completionId: "completion-floating-calculator-fab",
      });
    };

    await expect(run(false)).resolves.toMatchObject({
      kind: "plugin-completion",
      onboarding: { ok: true, decision: "omit" },
    });
    await expect(run(true)).resolves.toMatchObject({
      ok: false,
      decision: "omit",
      message: expect.stringContaining("although the confirmed decision was omit"),
    });
  });

  it("rejects reveal for an unverified completion", async () => {
    const tools = overlayTools();
    await prepareOverlayDraft(tools);
    await tools.plugin_apply.execute({ pluginId: "floating-calculator-fab" });

    await expect(tools.plugin_reveal_change.execute({
      completionId: "completion-floating-calculator-fab",
      mode: "spotlight",
      announcement: "Calculator is ready.",
    })).rejects.toThrow("has not passed semantic verification");
  });

  it("opens the exact plugin folder and undoes a still-current apply completion", async () => {
    const api = profile();
    const tools = overlayTools(api);
    await prepareOverlayDraft(tools);
    await tools.plugin_apply.execute({ pluginId: "floating-calculator-fab" });

    await expect(tools.plugin_open_folder.execute({
      pluginId: "floating-calculator-fab",
    })).resolves.toEqual({ path: "/plugins/floating-calculator-fab" });
    await expect(tools.plugin_undo.execute({
      completionId: "completion-floating-calculator-fab",
    })).resolves.toMatchObject({
      status: "replaced",
      completionId: "completion-floating-calculator-fab",
    });
    expect(api.openPluginFolder).toHaveBeenCalledWith("floating-calculator-fab");
    expect(api.undo).toHaveBeenCalledWith("completion-floating-calculator-fab");
  });

  it("creates a standalone plugin without selecting a replacement source", async () => {
    const api = profile();
    const tools = overlayTools(api);
    const plan = await prepareOverlayDraft(tools);
    expect(plan.planId).toEqual(expect.any(String));
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(await vi.mocked(api.create).mock.results[0]?.value).toMatchObject({
      status: "draft",
      pluginId: "floating-calculator-fab",
    });
    expect(api.create).toHaveBeenCalledWith("plan-floating-calculator-fab");
    expect(api.copyAndReplace).not.toHaveBeenCalled();
  });

  it("rejects using a create plan for a fork or replacement", async () => {
    const tools = overlayTools();
    const plan = await tools.plugin_plan.execute({}) as { planId: string };

    await expect(tools.plugin_fork.execute({ planId: plan.planId }))
      .rejects.toThrow("is create, not fork");
    await expect(tools.plugin_copy_and_replace.execute({ planId: plan.planId }))
      .rejects.toThrow("is create, not replace");
  });

  it("routes source operations only through the permissioned profile API", async () => {
    const api = profile();
    const tools = createPluginDevelopmentTools(api, evidence(), reveal());
    await expect(tools.plugin_source_read.execute({
      pluginId: "header-native",
      relativePath: "termco-plugin.json",
    })).resolves.toMatchObject({ content: "source" });
    await tools.plugin_source_write.execute({
      pluginId: "custom.header",
      relativePath: "src/renderer.tsx",
      content: "export default {};",
    });
    expect(api.writeSourceFile).toHaveBeenCalledWith(
      "custom.header",
      "src/renderer.tsx",
      "export default {};",
    );
  });

  it("rejects a guessed source path before invoking the main-process reader", async () => {
    const api = profile();
    vi.mocked(api.listSourceFiles).mockResolvedValue([
      "src/renderer.ts",
      "termco-plugin.json",
    ]);
    const tools = createPluginDevelopmentTools(api, evidence(), reveal());

    await expect(tools.plugin_source_read.execute({
      pluginId: "ui-shell-native",
      relativePath: "src/renderer.tsx",
    })).rejects.toThrow(
      'source file "src/renderer.tsx" does not exist in plugin "ui-shell-native"; use one of: src/renderer.ts',
    );
    expect(api.readSourceFile).not.toHaveBeenCalled();
  });

  it("requires approval for copying, writing, and transactional apply", () => {
    const tools = createPluginDevelopmentTools(profile(), evidence(), reveal());
    expect(tools.plugin_create.needsApproval).toBe(true);
    expect(tools.plugin_fork.needsApproval).toBe(true);
    expect(tools.plugin_set_enabled.needsApproval).toBe(true);
    expect(tools.plugin_copy_and_replace.needsApproval).toBe(true);
    expect(tools.plugin_source_write.needsApproval).toBe(true);
    expect(tools.plugin_apply.needsApproval).toBe(true);
    expect(tools.plugin_open_folder.needsApproval).toBe(true);
    expect(tools.plugin_undo.needsApproval).toBe(true);
    expect(tools.plugin_catalog.needsApproval).toBeUndefined();
  });
});
