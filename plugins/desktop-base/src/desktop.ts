export type DesktopLogLevel = "info" | "warn" | "error";

export type DesktopDragDropEvent =
  | { type: "enter"; paths: string[]; position: { x: number; y: number } }
  | { type: "over"; position: { x: number; y: number } }
  | { type: "drop"; paths: string[]; position: { x: number; y: number } }
  | { type: "leave" };

export interface DesktopIntegrationCapability {
  openUrl(url: string): Promise<void>;
  openPath(path: string): Promise<void>;
  revealItem(path: string): void;
  relaunch(): void;
  exit(code: number): void;
  setAutostart(enabled: boolean): void;
  autostartEnabled(): boolean;
  readClipboardText(): string;
  writeClipboardText(text: string): void;
  notify(title: string, body: string): void;
  log(level: unknown, message: string): void;
  /** Renderer-local operating-system file-drop stream. The platform projects
   * the selected desktop provider onto the active renderer transport. */
  subscribeDragDrop(
    listener: (event: DesktopDragDropEvent) => void,
  ): () => void;
}

export type DesktopWindowEventName =
  | "close-requested"
  | "focus-changed"
  | "resized";

/** Privileged main-process transport implemented by the selected desktop
 * provider. Renderer projection supplies the caller window identity and maps
 * window events without exposing Electron or preload globals to plugins. */
export interface DesktopWindowControlCapability {
  show(): Promise<void>;
  hide(): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  close(): Promise<void>;
  destroy(): Promise<void>;
  setTitle(title: string): Promise<void>;
  focus(): Promise<void>;
  isFocused(): Promise<boolean>;
  startDragging(): Promise<void>;
  subscribe(
    event: DesktopWindowEventName,
    listener: (payload: unknown) => void,
  ): () => void;
}

export interface DesktopWindowCloseRequestedEvent {
  preventDefault(): void;
  isPreventDefault(): boolean;
}

/** Renderer-facing current-window module. The provider owns close-request
 * semantics and hides privileged targeting and event transport. */
export interface DesktopWindowCapability {
  show(): Promise<void>;
  hide(): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  close(): Promise<void>;
  setTitle(title: string): Promise<void>;
  focus(): Promise<void>;
  isFocused(): Promise<boolean>;
  startDragging(): Promise<void>;
  onCloseRequested(
    listener: (event: DesktopWindowCloseRequestedEvent) => void | Promise<void>,
  ): () => void;
  onFocusChanged(listener: (focused: boolean) => void): () => void;
  onResized(listener: () => void): () => void;
}
