// @vitest-environment jsdom
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RowAction } from "./RowAction";

afterEach(cleanup);

describe("RowAction", () => {
  it("fires its action without letting the click bubble to the row", () => {
    const onClick = vi.fn();
    const onRowClick = vi.fn();
    const { getByLabelText } = render(
      // biome-ignore lint/a11y/useKeyWithClickEvents: test-only click sink
      // biome-ignore lint/a11y/noStaticElementInteractions: test-only click sink
      <div onClick={onRowClick}>
        <RowAction icon={Delete02Icon} label="Delete rig" onClick={onClick} />
      </div>,
    );
    fireEvent.click(getByLabelText("Delete rig"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("tints destructive actions differently", () => {
    const { getByLabelText, rerender } = render(
      <RowAction
        icon={Delete02Icon}
        label="a"
        onClick={() => {}}
        destructive
      />,
    );
    expect(getByLabelText("a").className).toContain("hover:text-destructive");
    rerender(<RowAction icon={Delete02Icon} label="a" onClick={() => {}} />);
    expect(getByLabelText("a").className).not.toContain(
      "hover:text-destructive",
    );
  });
});
