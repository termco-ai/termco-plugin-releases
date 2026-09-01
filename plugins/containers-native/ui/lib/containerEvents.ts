import type { ContainerRuntime } from "../types";
import {
  openContainerBrowser,
  openContainerDetailTab,
  runContainerTerminal,
} from "./integrations";
import { runtimeBinary } from "./runtimeMeta";

export type ContainerDetailDetail = {
  runtime: ContainerRuntime;
  id: string;
  name: string;
};
export type ContainerShellDetail = {
  runtime: ContainerRuntime;
  id: string;
  name: string;
};
export type ContainerPreviewDetail = { url: string };

/** Open (or focus) the rich detail tab for one container. */
export function openContainerDetail(detail: ContainerDetailDetail): void {
  openContainerDetailTab(detail);
}

/** Open a terminal that execs a shell inside the container. */
export function openContainerShell(detail: ContainerShellDetail): void {
  void runContainerTerminal(
    `${runtimeBinary(detail.runtime)} exec -it ${detail.id} sh`,
  );
}

/** Open a published container port in a web preview tab. */
export function openContainerPreview(url: string): void {
  openContainerBrowser(url);
}
