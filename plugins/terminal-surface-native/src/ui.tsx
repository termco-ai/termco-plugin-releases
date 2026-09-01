import ui from "@termco/ui";
import * as ResizablePrimitive from "react-resizable-panels";

export const { Tooltip, TooltipContent, TooltipTrigger, cn } = ui;

export function ResizablePanelGroup(props: ResizablePrimitive.GroupProps) {
  return <ResizablePrimitive.Group data-slot="resizable-panel-group" className={ui.cn("flex h-full w-full aria-[orientation=vertical]:flex-col", props.className)} {...props} />;
}

export function ResizablePanel(props: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

export function ResizableHandle(props: ResizablePrimitive.SeparatorProps) {
  return <ResizablePrimitive.Separator data-slot="resizable-handle" className={ui.cn("relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full", props.className)} {...props} />;
}
