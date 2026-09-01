import type { UiHeaderSearchCapability } from "@termco/ui-header-base";

export class HeaderSearchFocus implements UiHeaderSearchCapability {
  #focus: (() => void) | null = null;

  focus(): void {
    if (this.#focus) {
      this.#focus();
      return;
    }
    globalThis.requestAnimationFrame?.(() => this.#focus?.());
  }

  register(focus: () => void): () => void {
    this.#focus = focus;
    return () => {
      if (this.#focus === focus) this.#focus = null;
    };
  }
}
