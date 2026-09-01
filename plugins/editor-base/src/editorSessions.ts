/** Public renderer seam for the live editor panes owned by the selected
 * editor surface provider. Consumers never receive CodeMirror or plugin-local
 * handle objects. */
export interface EditorSessionsCapability {
  ids(): readonly number[];
  subscribe(listener: () => void): () => void;
  whenReady(id: number): Promise<void>;
  setQuery(id: number, query: string): boolean;
  findNext(id: number): boolean;
  findPrevious(id: number): boolean;
  clearQuery(id: number): boolean;
  focus(id: number): boolean;
  selection(id: number): string | null;
  path(id: number): string | null;
  save(id: number): Promise<boolean>;
  reload(id: number): boolean;
  gotoLine(id: number, line: number, character?: number): boolean;
  undo(id: number): boolean;
  redo(id: number): boolean;
}
