import type {
  AiLibraryMcpServer,
  AiLibraryMcpStatus,
} from "@termco/ai-library-base";
import { actions, hydrate, snapshot, subscribe, useLibrarySelector } from "../runtime";

export type McpServerStatus = AiLibraryMcpStatus;
type State = {
  hydrated: boolean;
  status: Record<string, McpServerStatus>;
  enabledServers: Record<string, string[]>;
  userServers: AiLibraryMcpServer[];
  userDisabled: string[];
  hydrate(): Promise<void>;
  addUserServers(servers: AiLibraryMcpServer[]): Promise<void>;
  removeUserServer(name: string): Promise<void>;
  disconnectServer(name: string): Promise<void>;
  signOut(name: string): Promise<void>;
};
const state = (): State => ({
  hydrated: snapshot().hydrated,
  status: snapshot().mcpStatus,
  enabledServers: snapshot().enabledMcpServers,
  userServers: snapshot().userMcpServers,
  userDisabled: snapshot().disabledUserMcpServers,
  hydrate,
  addUserServers: actions.addMcpServers,
  removeUserServer: actions.removeMcpServer,
  disconnectServer: actions.disconnectMcpServer,
  signOut: actions.signOutMcpServer,
});
function useStore<T>(selector: (value: State) => T): T {
  useLibrarySelector((value) => value.revision);
  return selector(state());
}
export const useMcpStore = Object.assign(useStore, { getState: state, subscribe });
