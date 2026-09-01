// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SPACE_COLORS } from "../lib/rigColor";
import { RigAvatar } from "./RigAvatar";

afterEach(cleanup);

describe("RigAvatar", () => {
  it("renders the uppercased initial", () => {
    const { container } = render(<RigAvatar rig={{ name: "work" }} />);
    expect(container.textContent).toBe("W");
  });

  it("renders ? for a blank name", () => {
    const { container } = render(<RigAvatar rig={{ name: "  " }} />);
    expect(container.textContent).toBe("?");
  });

  it("tints an active avatar with its accent color", () => {
    const { container } = render(
      <RigAvatar rig={{ name: "dev", color: 0 }} active />,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.color).toBe(SPACE_COLORS[0]);
    expect(el.style.backgroundColor).toContain(SPACE_COLORS[0]);
  });

  it("keeps inactive avatars unstyled", () => {
    const { container } = render(<RigAvatar rig={{ name: "dev", color: 0 }} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.color).toBe("");
    expect(el.className).toContain("ring-border/50");
  });

  it("supports the md size variant", () => {
    const { container } = render(<RigAvatar rig={{ name: "dev" }} size="md" />);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "size-7",
    );
  });
});
