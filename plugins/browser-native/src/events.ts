import type { ApplicationEventsCapability } from "@termco/events-base";

let events: ApplicationEventsCapability | null = null;

export function browserEventsActive(): boolean {
  return events !== null;
}

export function configureBrowserEvents(value: ApplicationEventsCapability | null): void {
  events = value;
}

export function emitBrowserEvent(
  _windowLabel: string,
  event: string,
  payload: unknown,
): void {
  events?.emit(event, payload);
}
