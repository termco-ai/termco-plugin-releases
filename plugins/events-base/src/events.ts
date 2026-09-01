export type ApplicationEventListener = (payload: unknown) => void;
export type AnyApplicationEventListener = (
  event: string,
  payload: unknown,
) => void;

/** Application-wide event routing without window or transport coupling. */
export interface ApplicationEventsCapability {
  emit(event: string, payload: unknown): void;
  subscribe(event: string, listener: ApplicationEventListener): () => void;
  subscribeAll(listener: AnyApplicationEventListener): () => void;
  listenerCount(event: string): number;
}
