import { editorRuntime } from "./runtime";
import type { WorkspaceEnv } from "./workspace";

export function lspDiagnosticsForOpenDocument(
  workspace: WorkspaceEnv,
  path: string,
) {
  return editorRuntime().lsp.diagnosticsForOpenDocument(workspace, path);
}

export async function invoke<T = unknown>(
  command: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const runtime = editorRuntime();
  switch (command) {
    case "fs_read_file":
      return runtime.files.readFile(
        payload.path as string,
        payload.workspace as never,
      ) as Promise<T>;
    case "fs_write_file":
      await runtime.files.writeFile(
        payload.path as string,
        payload.content as string,
        payload.workspace as never,
        payload.source as string | undefined,
      );
      return null as T;
    case "fs_create_file":
      await runtime.files.createFile(
        payload.path as string,
        payload.workspace as never,
      );
      return null as T;
    default:
      return (runtime.lsp.invoke as unknown as (
        command: string,
        payload: Record<string, unknown>,
      ) => Promise<T>)(command, payload);
  }
}

export function convertFileSrc(filePath: string): string {
  const encoded = encodeURIComponent(filePath).replace(/%2F/g, "/");
  return `termco-asset://localhost/${encoded}?protocol=asset`;
}
