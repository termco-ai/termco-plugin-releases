import type { ApplicationEventsCapability } from "@termco/events-base";

let events: ApplicationEventsCapability | null = null;

export function configureEvents(value: ApplicationEventsCapability | null): void {
  events = value;
}

export function sshEventsActive(): boolean {
  return events !== null;
}

export function emit(event: string, payload: unknown): void {
  if (!events) throw new Error("ssh event capability is not configured");
  events.emit(event, payload);
}
