import { AI_LIBRARY_SERVICE, type AiLibraryCapability } from "@termco/ai-library-base";
import { EVENTS_APPLICATION_SERVICE, type ApplicationEventsCapability } from "@termco/events-base";
import { WORKSPACE_FILES_SERVICE, type WorkspaceFilesCapability } from "@termco/files-base";
import type { PluginModule } from "@termco/kernel";
import type {
  UiSidebarViewRegistry,
  UiSidebarBadgeProps,
  UiSidebarViewContribution,
  UiSidebarViewProps,
} from "@termco/ui-sidebar-base";
import { UI_SIDEBAR_VIEWS_SERVICE } from "@termco/ui-sidebar-base";
import { PuzzleIcon } from "@hugeicons/core-free-icons";
import { SkillsPanel } from "./SkillsPanel";
import { configureDetector, useSkillsDetector } from "./detector";
import { configureFiles, setActiveWorkspace } from "./fileRuntime";
import { configureLibrary } from "./libraryStore";

function Panel(props: UiSidebarViewProps) {
  setActiveWorkspace(props.workspace);
  const detector = useSkillsDetector(props.rootPath, props.workspace);
  return <SkillsPanel detector={detector} onOpenFile={props.openFile} />;
}

function useBadge({ rootPath, workspace }: UiSidebarBadgeProps): number {
  return useSkillsDetector(rootPath, workspace).count;
}

const plugin: PluginModule = {
  inject: [
    AI_LIBRARY_SERVICE,
    WORKSPACE_FILES_SERVICE,
    EVENTS_APPLICATION_SERVICE,
    UI_SIDEBAR_VIEWS_SERVICE,
  ],
  async activate(context) {
    const library = context.get<AiLibraryCapability>("ai.library");
    await context.effect(() => configureDetector(library));
    await context.effect(() =>
      configureFiles(context.get<WorkspaceFilesCapability>("workspace.files")),
    );
    await context.effect(() =>
      configureLibrary(
        library,
        context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE),
      ),
    );
    const contribution: UiSidebarViewContribution = {
      id: "skills",
      label: "Adopt agent config",
      description:
        "Discover, explain, enable, and adopt agents, skills, rules, snippets, and MCP servers from this workspace.",
      icon: PuzzleIcon,
      order: 50,
      useBadge,
      Component: Panel,
    };
    await context.effect(() =>
      context
        .get<UiSidebarViewRegistry>(UI_SIDEBAR_VIEWS_SERVICE)
        .register(contribution, {
          pluginId: "skills-panel-native",
          generation: context.generation,
          key: contribution.id,
        }),
    );
  },
};

export default plugin;
