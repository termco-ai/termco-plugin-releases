import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { SshAuthPrompt, SshClientCapability } from "@termco/ssh-base";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthenticationDialog } from "./AuthenticationDialog";

afterEach(cleanup);
function setup(kind: SshAuthPrompt["kind"] = "password") {
  let listener = () => {};
  let prompts: SshAuthPrompt[] = [
    { id: "prompt", connectionId: "dev@host", message: "dev@host's password:", kind, retry: false },
  ];
  const events = {
    subscribe: vi.fn((_event, callback) => {
      listener = callback;
      return vi.fn();
    }),
  } as unknown as ApplicationEventsCapability;
  const authRespond = vi.fn(async () => {
    prompts = [];
    listener();
  });
  const ssh = {
    authPrompts: vi.fn(async () => prompts),
    authRespond,
  } as unknown as SshClientCapability;
  render(<AuthenticationDialog ssh={ssh} events={events} />);
  return {
    authRespond,
    change: async (value: SshAuthPrompt[]) => {
      prompts = value;
      await act(async () => listener());
    },
  };
}

describe("SSH authentication dialog", () => {
  it("shows a masked password field, saves by default, and closes after submission", async () => {
    const { authRespond } = setup();
    const input = await screen.findByLabelText("Password or passphrase");
    expect(input.getAttribute("type")).toBe("password");
    expect(
      (screen.getByRole("checkbox", { name: "Save in Termco" }) as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.change(input, { target: { value: "test-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() =>
      expect(authRespond).toHaveBeenCalledWith("prompt", { value: "test-password", save: true }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("cancels the pending connection", async () => {
    const { authRespond } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(authRespond).toHaveBeenCalledWith("prompt", null));
  });

  it("lets the user recover from a secret-store error without saving", async () => {
    const { authRespond } = setup();
    authRespond.mockRejectedValueOnce(new Error("Could not save the password"));
    fireEvent.change(await screen.findByLabelText("Password or passphrase"), {
      target: { value: "test-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Could not save the password");
    fireEvent.click(screen.getByRole("checkbox", { name: "Save in Termco" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() =>
      expect(authRespond).toHaveBeenLastCalledWith("prompt", {
        value: "test-password",
        save: false,
      }),
    );
  });

  it("receives new prompts while mounted and clears the previous input", async () => {
    const { change } = setup();
    fireEvent.change(await screen.findByLabelText("Password or passphrase"), {
      target: { value: "rejected-password" },
    });
    await change([
      {
        id: "retry",
        connectionId: "dev@host",
        message: "Password:",
        kind: "password",
        retry: true,
      },
    ]);
    expect(
      ((await screen.findByLabelText("Password or passphrase")) as HTMLInputElement).value,
    ).toBe("");
    expect(screen.getByText(/previous credential was rejected/)).toBeDefined();
  });

  it("requires explicit host trust without offering to save a password", async () => {
    const { authRespond } = setup("confirmation");
    fireEvent.click(await screen.findByRole("button", { name: "Trust host and connect" }));
    expect(screen.queryByRole("checkbox")).toBeNull();
    await waitFor(() =>
      expect(authRespond).toHaveBeenCalledWith("prompt", { value: "yes", save: false }),
    );
  });
});
