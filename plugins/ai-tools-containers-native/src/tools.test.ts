import { describe, expect, it, vi } from "vitest";
import { buildContainerTools, buildPortTools } from "./tools";

describe("container and port AI tools", () => {
  it("uses the shared container provider and approval-gates lifecycle changes", async () => {
    const provider = {
      list: vi.fn(async () => ({ containers: [{ id: "abc", name: "web", image: "nginx", state: "running", runtime: "docker" }], availability: { docker: true } })),
      action: vi.fn(async () => {}),
    } as never;
    const tools = buildContainerTools(provider, { getWorkspaceEnv: () => ({ kind: "local" }) });
    expect(tools.container_action.needsApproval).toBe(true);
    expect(tools.container_list.needsApproval).toBeUndefined();
    await expect(tools.container_list.execute({})).resolves.toEqual(expect.objectContaining({ containers: [expect.objectContaining({ id: "abc" })] }));
    expect((provider as { list: ReturnType<typeof vi.fn> }).list).toHaveBeenCalledWith({ kind: "local" });
  });

  it("targets the chat workspace's shared SSH connection", async () => {
    const ssh = { forwardList: vi.fn(async () => [{ id: "forward" }]) } as never;
    const tools = buildPortTools(ssh, { getWorkspaceEnv: () => ({ kind: "ssh", connectionId: "dev@host", host: "host" }) });
    await expect(tools.ports_list.execute({})).resolves.toEqual({ forwards: [{ id: "forward" }] });
    expect((ssh as { forwardList: ReturnType<typeof vi.fn> }).forwardList).toHaveBeenCalledWith("dev@host");
    expect(tools.port_forward_add.needsApproval).toBe(true);
    expect(tools.port_forward_stop.needsApproval).toBe(true);
  });
});
