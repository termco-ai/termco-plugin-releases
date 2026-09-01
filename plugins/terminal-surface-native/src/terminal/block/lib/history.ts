import { currentWorkspaceEnv, terminalRuntime } from "../../../runtime";

export function historySuggest(line: string): Promise<string | null> {
  return terminalRuntime().history.suggest(line, currentWorkspaceEnv()).catch(
    () => null,
  );
}

export function historyCommands(prefix: string, limit = 50): Promise<string[]> {
  return terminalRuntime().history.commands(prefix, limit, currentWorkspaceEnv()).catch(
    () => [],
  );
}

export function historyList(query: string, limit = 200): Promise<string[]> {
  return terminalRuntime().history.list(query, limit, currentWorkspaceEnv()).catch(
    () => [],
  );
}

export function historyRecord(command: string): void {
  void terminalRuntime().history.record(command, currentWorkspaceEnv()).catch(() => {});
}
