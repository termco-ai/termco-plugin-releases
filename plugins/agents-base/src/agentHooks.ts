export interface AgentHooksCapability {
  enable(agent: string): void;
  status(agent: string): boolean;
}
