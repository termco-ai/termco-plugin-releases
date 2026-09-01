// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanDiffReview } from "./PlanDiffReview";

const { writeFileMock, createDirMock } = vi.hoisted(() => ({
  writeFileMock: vi.fn(),
  createDirMock: vi.fn(),
}));

vi.mock("../../lib/native", () => ({
  native: { writeFile: writeFileMock, createDir: createDirMock },
}));

import { type QueuedEdit, usePlanStore } from "../../store/planStore";

function makeItem(over: Partial<QueuedEdit> = {}): QueuedEdit {
  return {
    id: "q1",
    kind: "write_file",
    path: "/proj/a.ts",
    originalContent: "",
    proposedContent: "content",
    isNewFile: true,
    ...over,
  };
}

afterEach(cleanup);

beforeEach(() => {
  writeFileMock.mockReset().mockResolvedValue(undefined);
  createDirMock.mockReset().mockResolvedValue(undefined);
  usePlanStore.setState({ active: false, queue: [] });
});

describe("PlanDiffReview", () => {
  it("renders nothing when the queue is empty", () => {
    const { container } = render(<PlanDiffReview />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists queued changes with a pluralized header", () => {
    usePlanStore.setState({
      queue: [makeItem(), makeItem({ id: "q2", path: "/proj/b.ts" })],
    });
    render(<PlanDiffReview />);
    expect(screen.getByText("2 pending changes")).toBeInTheDocument();
    expect(screen.getByText("a.ts")).toBeInTheDocument();
    expect(screen.getByText("b.ts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply 2/ })).toBeInTheDocument();
  });

  it("uses singular wording for one change", () => {
    usePlanStore.setState({ queue: [makeItem()] });
    render(<PlanDiffReview />);
    expect(screen.getByText("1 pending change")).toBeInTheDocument();
  });

  it("discard all clears the queue and unmounts the overlay", () => {
    usePlanStore.setState({ queue: [makeItem()] });
    render(<PlanDiffReview />);
    fireEvent.click(screen.getByRole("button", { name: /Discard all/ }));
    expect(usePlanStore.getState().queue).toHaveLength(0);
    expect(screen.queryByText("Plan review")).not.toBeInTheDocument();
  });

  it("removes a single row via its reject button", () => {
    usePlanStore.setState({
      queue: [makeItem(), makeItem({ id: "q2", path: "/proj/b.ts" })],
    });
    render(<PlanDiffReview />);
    fireEvent.click(screen.getAllByRole("button", { name: "Reject" })[0]);
    expect(usePlanStore.getState().queue.map((q) => q.id)).toEqual(["q2"]);
    expect(screen.getByText("1 pending change")).toBeInTheDocument();
  });

  it("apply writes files, creates directories, and clears the queue", async () => {
    usePlanStore.setState({
      queue: [
        makeItem(),
        makeItem({
          id: "q2",
          kind: "create_directory",
          path: "/proj/dir",
          proposedContent: "",
        }),
      ],
    });
    render(<PlanDiffReview />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Apply 2/ }));
    });
    expect(writeFileMock).toHaveBeenCalledWith("/proj/a.ts", "content");
    expect(createDirMock).toHaveBeenCalledWith("/proj/dir");
    expect(usePlanStore.getState().queue).toHaveLength(0);
    expect(screen.queryByText("Plan review")).not.toBeInTheDocument();
  });

  it("logs failures but still clears the queue", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    writeFileMock.mockRejectedValue(new Error("disk full"));
    usePlanStore.setState({ queue: [makeItem()] });
    render(<PlanDiffReview />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Apply 1/ }));
    });
    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "plan apply failures:",
        expect.arrayContaining([expect.objectContaining({ ok: false })]),
      );
    });
    expect(usePlanStore.getState().queue).toHaveLength(0);
    errorSpy.mockRestore();
  });
});
