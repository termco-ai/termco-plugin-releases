export const PREFERENCES_CHANGED_EVENT = "termco://prefs-changed";

export type PreferenceChangeListener = (key: string, value: unknown) => void;

/** Application-wide, durable user preferences. Feature plugins own the
 * meaning and validation of their keys; the selected provider owns shared
 * persistence and cross-window change notification. */
export interface PreferencesCapability {
  get<T = unknown>(key: string): Promise<T | undefined>;
  getMany(keys: string[]): Promise<Record<string, unknown>>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  /** Observe committed changes from every window and process. The provider
   * publishes only after the durable write completes. */
  subscribe(listener: PreferenceChangeListener): () => void;
}
