/** A platform-neutral keyboard chord. Renderer plugins may add arbitrary
 * shortcut ids; consumers should treat ids and groups as open strings. */
export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

export type ShortcutId = string;

export interface ShortcutDefinition {
  id: ShortcutId;
  label: string;
  description?: string;
  group: string;
  defaultBindings: KeyBinding[];
  allowRepeat?: boolean;
  configurable?: boolean;
}

export interface ShortcutKeyEvent {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export interface ShortcutRegistrySnapshot {
  revision: number;
  groups: readonly string[];
  shortcuts: readonly ShortcutDefinition[];
  overrides: Readonly<Record<ShortcutId, readonly KeyBinding[]>>;
}

export type ShortcutHandler = (event: KeyboardEvent) => void;
export type ShortcutHandlers = Readonly<
  Partial<Record<ShortcutId, ShortcutHandler>>
>;

export interface ShortcutHandlerOptions {
  /** Return true to let the matching key event continue to the focused
   * surface instead of claiming it for the application shortcut. */
  isDisabled?: (id: ShortcutId, event: KeyboardEvent) => boolean;
}

/** The one selected application-wide shortcut registry. It owns definitions,
 * effective bindings, matching, display formatting, and durable overrides. */
export interface ShortcutRegistryCapability {
  snapshot(): ShortcutRegistrySnapshot;
  subscribe(listener: () => void): () => void;
  bindings(id: ShortcutId): readonly KeyBinding[];
  match(event: ShortcutKeyEvent, binding: KeyBinding, id?: ShortcutId): boolean;
  format(binding?: KeyBinding): string[];
  /** Register renderer actions with the provider-owned global dispatcher.
   * The provider owns matching, repeat policy, recorder exclusion, event
   * cancellation, listener ordering, and unmount cleanup. */
  useHandlers(
    handlers: ShortcutHandlers,
    options?: ShortcutHandlerOptions,
  ): void;
  setBindings(id: ShortcutId, bindings: KeyBinding[]): Promise<void>;
  reset(id: ShortcutId): Promise<void>;
  resetAll(): Promise<void>;
}
