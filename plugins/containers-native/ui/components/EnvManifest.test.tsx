// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnvVar } from "../lib/inspectParse";
import { EnvManifest } from "./EnvManifest";

afterEach(cleanup);

const env: EnvVar[] = [
  { key: "PATH", value: "/usr/bin", secret: false },
  { key: "DB_PASSWORD", value: "hunter2secret", secret: true },
];

describe("EnvManifest", () => {
  it("shows plain values but masks secrets until revealed", () => {
    render(<EnvManifest env={env} />);
    expect(screen.getByText("/usr/bin")).toBeTruthy();
    // Secret value is not in the DOM while masked.
    expect(screen.queryByText("hunter2secret")).toBeNull();
    expect(screen.getByText("••••••••••••")).toBeTruthy();
    // Reveal it.
    fireEvent.click(screen.getByLabelText("Reveal value"));
    expect(screen.getByText("hunter2secret")).toBeTruthy();
    // Toggle back to hidden.
    fireEvent.click(screen.getByLabelText("Hide value"));
    expect(screen.queryByText("hunter2secret")).toBeNull();
  });

  it("counts entries and secrets in the header", () => {
    const { container } = render(<EnvManifest env={env} />);
    expect(container.textContent).toContain("1 secret");
  });

  it("copies a value to the clipboard", () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    render(<EnvManifest env={env} />);
    fireEvent.click(screen.getByLabelText("Copy PATH"));
    expect(writeText).toHaveBeenCalledWith("/usr/bin");
  });

  it("collapses and expands", () => {
    render(<EnvManifest env={env} />);
    expect(screen.getByText("/usr/bin")).toBeTruthy();
    // Collapse via the header button (the one holding the "Environment" label).
    fireEvent.click(screen.getByText("Environment"));
    expect(screen.queryByText("/usr/bin")).toBeNull();
  });
});
