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
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Snippet,
  SnippetAddon,
  SnippetCopyButton,
  SnippetInput,
  SnippetText,
} from "./snippet";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setClipboard(writeText: (() => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
}

describe("Snippet", () => {
  it("renders the code in a readonly input", () => {
    render(
      <Snippet code="pnpm install">
        <SnippetInput />
      </Snippet>,
    );
    const input = screen.getByDisplayValue("pnpm install");
    expect(input).toHaveAttribute("readonly");
  });

  it("renders addon and text sections", () => {
    render(
      <Snippet code="x">
        <SnippetAddon>
          <SnippetText>$</SnippetText>
        </SnippetAddon>
        <SnippetInput />
      </Snippet>,
    );
    expect(screen.getByText("$")).toBeInTheDocument();
  });
});

describe("SnippetCopyButton", () => {
  it("copies the snippet code and calls onCopy", async () => {
    const writeText = vi.fn(async () => {});
    setClipboard(writeText);
    const onCopy = vi.fn();
    render(
      <Snippet code="copy target">
        <SnippetCopyButton onCopy={onCopy} />
      </Snippet>,
    );
    fireEvent.click(screen.getByLabelText("Copy"));
    await waitFor(() => expect(onCopy).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith("copy target");
  });

  it("does not copy again while in the copied state", async () => {
    const writeText = vi.fn(async () => {});
    setClipboard(writeText);
    const onCopy = vi.fn();
    render(
      <Snippet code="once">
        <SnippetCopyButton onCopy={onCopy} timeout={5000} />
      </Snippet>,
    );
    fireEvent.click(screen.getByLabelText("Copy"));
    await waitFor(() => expect(onCopy).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByLabelText("Copy"));
    await act(async () => {});
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("copies again after the timeout resets the state", async () => {
    const writeText = vi.fn(async () => {});
    setClipboard(writeText);
    render(
      <Snippet code="twice">
        <SnippetCopyButton timeout={100} />
      </Snippet>,
    );
    fireEvent.click(screen.getByLabelText("Copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    await act(
      () => new Promise((resolve) => window.setTimeout(resolve, 150)),
    );
    fireEvent.click(screen.getByLabelText("Copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
  });

  it("reports an error when the clipboard API is unavailable", () => {
    setClipboard(undefined);
    const onError = vi.fn();
    render(
      <Snippet code="x">
        <SnippetCopyButton onError={onError} />
      </Snippet>,
    );
    fireEvent.click(screen.getByLabelText("Copy"));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it("reports write failures via onError", async () => {
    const failure = new Error("denied");
    setClipboard(vi.fn(async () => {
      throw failure;
    }));
    const onError = vi.fn();
    render(
      <Snippet code="x">
        <SnippetCopyButton onError={onError} />
      </Snippet>,
    );
    fireEvent.click(screen.getByLabelText("Copy"));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
  });

  it("renders custom children", () => {
    setClipboard(undefined);
    render(
      <Snippet code="x">
        <SnippetCopyButton>custom copy</SnippetCopyButton>
      </Snippet>,
    );
    expect(screen.getByText("custom copy")).toBeInTheDocument();
  });
});
