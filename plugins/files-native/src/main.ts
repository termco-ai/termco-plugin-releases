import type { ApplicationEventsCapability } from "@termco/events-base";
import type {
  WorkspaceDirEntry,
  WorkspaceFilesCapability,
  WorkspaceFileSearchResult,
} from "@termco/files-base";
import type { PluginModule } from "@termco/kernel";
import type {
  WorkspaceCapability,
  WorkspaceEnv,
  WorkspaceExecutionCapability,
} from "@termco/workspace-base";
import {
  fsCanonicalize,
  fsReadFile,
  fsStat,
  fsWriteFile,
  isMissingFileError,
} from "./file";
import { fsGlob, fsGrep, fsGrepInteractive } from "./grep";
import { fsCreateDir, fsCreateFile, fsCopy, fsDelete, fsRename } from "./mutate";
import { rgPath } from "./rg";
import { configureWorkspace } from "./runtime";
import { fsListFiles, fsSearch } from "./search";
import { fsReadDir, listSubdirs } from "./tree";
import { fsWatchAdd, fsWatchCloseAll, fsWatchRemove } from "./watch";
import { EVENTS_APPLICATION_SERVICE } from "@termco/events-base";
import {
  WORKSPACE_EXECUTION_SERVICE,
  WORKSPACE_REGISTRY_SERVICE,
} from "@termco/workspace-base";

function isRemote(environment: WorkspaceEnv): boolean {
  return environment?.kind === "ssh";
}

function remote<T>(
  execution: WorkspaceExecutionCapability,
  environment: WorkspaceEnv,
  method: string,
  args: readonly unknown[],
): Promise<T> {
  return execution.invoke<T>(environment, { domain: "files", method, args });
}

const plugin: PluginModule = {
  inject: [
    WORKSPACE_REGISTRY_SERVICE,
    EVENTS_APPLICATION_SERVICE,
    WORKSPACE_EXECUTION_SERVICE,
  ],
  async activate(context) {
    const workspace = context.get<WorkspaceCapability>("workspace.registry");
    const events = context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE);
    const execution = context.get<WorkspaceExecutionCapability>(WORKSPACE_EXECUTION_SERVICE);
    await context.effect(() => configureWorkspace(workspace));
    await context.effect(() => fsWatchCloseAll);

    const capability: WorkspaceFilesCapability = {
      async readFile(path, environment, optional) {
        try {
          return isRemote(environment)
            ? await remote<unknown>(execution, environment, "readFile", [path])
            : fsReadFile(path, environment);
        } catch (error) {
          if (optional && isMissingFileError(error)) return { kind: "missing" };
          throw error;
        }
      },
      async writeFile(path, content, environment, source) {
        if (isRemote(environment)) {
          await remote<unknown>(execution, environment, "writeFile", [path, content]);
          events.emit("fs:file-written", { path, ...(source ? { source } : {}) });
        } else {
          fsWriteFile(path, content, environment, source, events.emit.bind(events));
        }
      },
      async canonicalize(path, environment) {
        return isRemote(environment)
          ? remote<string>(execution, environment, "canonicalize", [path])
          : fsCanonicalize(path, environment);
      },
      async stat(path, environment, optional) {
        try {
          return isRemote(environment)
            ? await remote<unknown>(execution, environment, "stat", [path])
            : fsStat(path, environment);
        } catch (error) {
          if (optional && isMissingFileError(error)) return null;
          throw error;
        }
      },
      async readDir(path, showHidden, gitDecorations, environment, optional) {
        try {
          return isRemote(environment)
            ? await remote<WorkspaceDirEntry[]>(execution, environment, "readDir", [path, showHidden, gitDecorations])
            : await fsReadDir(path, showHidden, gitDecorations, environment);
        } catch (error) {
          if (optional && isMissingFileError(error)) return [];
          throw error;
        }
      },
      async listSubdirs(path, showHidden, environment) {
        return isRemote(environment)
          ? remote<string[]>(execution, environment, "listSubdirs", [path, showHidden])
          : listSubdirs(path, showHidden, environment);
      },
      async createFile(path, environment) {
        if (isRemote(environment)) await remote<unknown>(execution, environment, "createFile", [path]);
        else fsCreateFile(path, environment);
      },
      async createDir(path, environment) {
        if (isRemote(environment)) await remote<unknown>(execution, environment, "createDir", [path]);
        else fsCreateDir(path, environment);
      },
      async rename(from, to, environment) {
        if (isRemote(environment)) await remote<unknown>(execution, environment, "rename", [from, to]);
        else fsRename(from, to, environment);
      },
      async delete(path, environment) {
        if (isRemote(environment)) await remote<unknown>(execution, environment, "delete", [path]);
        else fsDelete(path, environment);
      },
      async copy(sources, destination, environment) {
        if (isRemote(environment)) await remote<unknown>(execution, environment, "copy", [sources, destination]);
        else fsCopy(sources, destination, environment);
      },
      async watchAdd(paths, environment) {
        if (isRemote(environment)) await remote<unknown>(execution, environment, "watchAdd", [paths]);
        else fsWatchAdd(paths, environment, events.emit.bind(events));
      },
      async watchRemove(paths, environment) {
        if (isRemote(environment)) await remote<unknown>(execution, environment, "watchRemove", [paths]);
        else fsWatchRemove(paths, environment);
      },
      async search(params, environment) {
        return isRemote(environment)
          ? remote<WorkspaceFileSearchResult>(execution, environment, "search", [params])
          : fsSearch(
              String(params.root),
              String(params.query),
              params.limit as number | undefined,
              environment,
              params.showHidden as boolean | undefined,
            );
      },
      async listFiles(params, environment) {
        return isRemote(environment)
          ? remote<unknown>(execution, environment, "listFiles", [params])
          : fsListFiles(
              String(params.root),
              params.limit as number | undefined,
              params.maxDepth as number | undefined,
              environment,
              params.showHidden as boolean | undefined,
            );
      },
      async grep(params, environment) {
        return isRemote(environment)
          ? remote<unknown>(execution, environment, "grep", [params])
          : fsGrep(
              String(params.pattern),
              String(params.root),
              params.glob as string[] | undefined,
              params.caseInsensitive as boolean | undefined,
              params.maxResults as number | undefined,
              environment,
            );
      },
      async grepInteractive(params, environment) {
        return isRemote(environment)
          ? remote<unknown>(execution, environment, "grep", [params])
          : fsGrepInteractive(
              String(params.pattern),
              String(params.root),
              params.maxResults as number | undefined,
              environment,
            );
      },
      async glob(params, environment) {
        return isRemote(environment)
          ? remote<unknown>(execution, environment, "glob", [params])
          : fsGlob(
              String(params.pattern),
              String(params.root),
              params.maxResults as number | undefined,
              environment,
            );
      },
      readFileLocal: fsReadFile,
      ripgrepPath: rgPath,
    };

    context.provide("workspace.files", capability);
  },
};

export default plugin;
