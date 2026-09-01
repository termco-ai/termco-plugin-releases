/** Editor-level workflows owned by the selected editor surface. Consumers
 * request intent without importing the editor's dialog state or UI. */
export interface EditorNavigationCapability {
  openNewFile(): void;
  openFile(path: string, pin?: boolean): number;
  openFileAt(path: string, line: number, pin?: boolean): number;
  pin(id: number): boolean;
  setLanguage(id: number, language: string | null): boolean;
  /** Retarget open editor documents after a file or directory rename. */
  retargetPath(from: string, to: string): number;
}
