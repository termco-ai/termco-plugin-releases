// @vitest-environment jsdom
import type { AiModelProviderCapability } from "@termco/ai-models-base";
import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { HttpCapability } from "@termco/http-base";
import type {
  PreferencesCapability,
  SecretsCapability,
} from "@termco/storage-base";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createModelsSettings } from "./renderer";

let values: Record<string, unknown>;
const listeners = new Set<(key: string, value: unknown) => void>();
const preferences = {
  getMany: vi.fn(async (keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, values[key]]))),
  set: vi.fn(async (key: string, value: unknown) => {
    values[key] = value;
    for (const listener of listeners) listener(key, value);
  }),
  subscribe(listener: (key: string, value: unknown) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
} as unknown as PreferencesCapability;
const providers = [
  {
    id: "openai",
    label: "OpenAI",
    keyringAccount: "openai-api-key",
    keyPrefix: "sk-",
    consoleUrl: "https://platform.openai.com",
    keyRequirement: "required",
    kind: "cloud",
    description: "Official OpenAI models.",
    defaultModelId: "gpt-test",
    models: [{
      id: "gpt-test", provider: "openai", label: "GPT Test", hint: "OpenAI", description: "Test model",
      capabilities: { intelligence: 4, speed: 4, cost: 3 }, contextWindow: 128_000,
    }],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    keyringAccount: "anthropic-api-key",
    keyPrefix: "sk-ant-",
    consoleUrl: "https://console.anthropic.com",
    keyRequirement: "required",
    kind: "cloud",
    description: "Official Anthropic models.",
    defaultModelId: "claude-test",
    models: [{
      id: "claude-test", provider: "anthropic", label: "Claude Test", hint: "Anthropic", description: "Test Claude model",
      capabilities: { intelligence: 4, speed: 3, cost: 3 }, contextWindow: 200_000,
    }],
  },
  {
    id: "ollama",
    label: "Ollama",
    keyringAccount: "ollama-api-key",
    keyPrefix: null,
    consoleUrl: "https://ollama.com",
    keyRequirement: "none",
    kind: "local",
    description: "Run models locally.",
    defaultBaseUrl: "http://localhost:11434/v1",
    models: [],
  },
] as unknown as readonly AiModelProviderCapability[];
const secrets = {
  getAll: vi.fn(async () => ["sk-company"]),
  set: vi.fn(async () => {}),
  delete: vi.fn(async () => {}),
} as unknown as SecretsCapability;
const events = { emit: vi.fn(async () => {}) } as unknown as ApplicationEventsCapability;
const http = { ping: vi.fn(async () => 10) } as unknown as HttpCapability;
const desktop = { openUrl: vi.fn() } as unknown as DesktopIntegrationCapability;

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  values = { defaultModelId: "gpt-test", autocompleteEnabled: false };
  listeners.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("exact Models settings section", () => {
  it("disables the default-model browser when no provider is connected", async () => {
    vi.mocked(secrets.getAll).mockResolvedValueOnce([]);
    const Section = createModelsSettings({ providers, preferences, secrets, events, http, desktop });
    render(<Section />);

    const trigger = await screen.findByRole("button", { name: /GPT Test/ });
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the current default model label on the trigger", async () => {
    const Section = createModelsSettings({ providers, preferences, secrets, events, http, desktop });
    render(<Section />);

    expect(await screen.findByRole("button", { name: /GPT Test/ })).toBeDefined();
  });

  it("lists only models from connected providers", async () => {
    vi.mocked(secrets.getAll).mockResolvedValueOnce([null, "sk-ant-company"]);
    const Section = createModelsSettings({ providers, preferences, secrets, events, http, desktop });
    render(<Section />);

    fireEvent.click(await screen.findByRole("button", { name: /GPT Test/ }));
    await screen.findByPlaceholderText("Search connected models");
    const items = [...document.querySelectorAll("[data-item]")];
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain("Claude Test");
    expect(items[0]?.textContent).not.toContain("GPT Test");
  });

  it("persists a default-model pick through shared preferences", async () => {
    vi.mocked(secrets.getAll).mockResolvedValueOnce([null, "sk-ant-company"]);
    const Section = createModelsSettings({ providers, preferences, secrets, events, http, desktop });
    render(<Section />);

    fireEvent.click(await screen.findByRole("button", { name: /GPT Test/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Claude Test/ }));
    await waitFor(() =>
      expect(preferences.set).toHaveBeenCalledWith("defaultModelId", "claude-test"),
    );
  });

  it("switches transcription provider and keeps its exact explanation", async () => {
    const Section = createModelsSettings({ providers, preferences, secrets, events, http, desktop });
    render(<Section />);

    fireEvent.pointerDown(await screen.findByRole("button", { name: "OpenAI Whisper" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Groq Whisper" }));
    await waitFor(() =>
      expect(preferences.set).toHaveBeenCalledWith("sttProvider", "groq"),
    );
    expect(screen.getByText(/official Groq API key/)).toBeDefined();
  });

  it("commits trimmed Groq and Whisper.cpp settings without rewriting unchanged drafts", async () => {
    values.sttProvider = "groq";
    const Section = createModelsSettings({ providers, preferences, secrets, events, http, desktop });
    const view = render(<Section />);
    const groq = await screen.findByLabelText("Groq transcription model");
    fireEvent.blur(groq);
    expect(preferences.set).not.toHaveBeenCalledWith("groqSttModel", expect.anything());
    fireEvent.change(groq, { target: { value: " whisper-large-v3 " } });
    fireEvent.blur(groq);
    expect(preferences.set).toHaveBeenCalledWith("groqSttModel", "whisper-large-v3");

    view.unmount();
    values.sttProvider = "whispercpp";
    render(<Section />);
    const whisper = await screen.findByLabelText("Whisper.cpp base URL");
    fireEvent.change(whisper, { target: { value: "http://127.0.0.1:9999 " } });
    fireEvent.blur(whisper);
    expect(preferences.set).toHaveBeenCalledWith(
      "whispercppBaseURL",
      "http://127.0.0.1:9999",
    );
    expect(screen.getByText("The local server used for offline transcription.")).toBeDefined();
  });

  it("restores the grouped defaults, voice, sources, real controls, and explanations", async () => {
    const Section = createModelsSettings({ providers, preferences, secrets, events, http, desktop });
    const { container } = render(<Section />);
    expect(await screen.findByText("Default assistant")).toBeDefined();
    expect(screen.getByText("Voice input")).toBeDefined();
    expect(screen.getByText("Model sources")).toBeDefined();
    expect(screen.getByText(/Keys are stored in the OS keychain/)).toBeDefined();
    expect(screen.getByText("1 connected source")).toBeDefined();
    expect(screen.getByText("in OS keychain")).toBeDefined();
    expect(screen.getByText("GPT-5 and the o-series")).toBeDefined();
    expect(screen.getByText("Uses your official OpenAI API key and the Whisper model.")).toBeDefined();
    expect(screen.getByRole("switch")).toBeDefined();
    expect(screen.getByRole("button", { name: /GPT Test/ })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Default model" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Enable autocomplete" })).toBeNull();
    expect(container.querySelectorAll(".rounded-lg.border").length).toBeGreaterThanOrEqual(3);
  });

  it("restores the provider catalogue and keeps model state provider-reactive", async () => {
    const Section = createModelsSettings({ providers, preferences, secrets, events, http, desktop });
    render(<Section />);
    fireEvent.click(await screen.findByRole("button", { name: /Add provider/ }));
    expect(screen.getByText("Connect a model source")).toBeDefined();
    expect(screen.getByText("Cloud")).toBeDefined();
    expect(screen.getByText("Local & custom")).toBeDefined();
    expect(screen.getByText("Ollama")).toBeDefined();
    const toggle = screen.getByRole("switch");
    act(() => {
      values.autocompleteEnabled = true;
      for (const listener of listeners) listener("autocompleteEnabled", true);
    });
    await waitFor(() => expect(toggle.getAttribute("data-state")).toBe("checked"));
  });

  it("insets the OpenAI-compatible endpoint form inside its card", async () => {
    const Section = createModelsSettings({ providers, preferences, secrets, events, http, desktop });
    render(<Section />);

    fireEvent.click(await screen.findByRole("button", { name: /Add provider/ }));
    fireEvent.click(screen.getByRole("button", { name: /OpenAI Compatible/ }));

    const form = await screen.findByTestId("compatible-endpoint-form");
    expect(form.classList.contains("px-4")).toBe(true);
    expect(form.classList.contains("pb-4")).toBe(true);
    expect(screen.getByLabelText("Endpoint name")).toBeDefined();
  });
});
