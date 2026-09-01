import { editorRuntime } from "./runtime";

export function getCurrentWebviewWindow() {
  return {
    listen<T>(event: string, listener: (event: { payload: T }) => void) {
      return Promise.resolve(
        editorRuntime().events.subscribe(event, (payload) =>
          listener({ payload: payload as T }),
        ),
      );
    },
  };
}
