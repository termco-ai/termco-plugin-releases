// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AttachmentChip } from "./AttachmentChip";

afterEach(cleanup);

const SRC = "data:image/png;base64,AAAA";

describe("AttachmentChip", () => {
  it("renders a collapsed chip with just the thumbnail + label", () => {
    const { container } = render(
      <AttachmentChip src={SRC} name="Page element" />,
    );
    expect(screen.getByText("Page element")).toBeInTheDocument();
    // Only the thumbnail, no full preview yet.
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("expands the full image inline on click — not as an overlay", () => {
    const { container } = render(
      <AttachmentChip src={SRC} name="Page element" />,
    );
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    // Thumbnail + inline full image, both from the same source.
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(2);
    for (const img of imgs) expect(img).toHaveAttribute("src", SRC);
    // Inline — no dialog/overlay.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Collapses again on a second click.
    fireEvent.click(screen.getByRole("button"));
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });
});
