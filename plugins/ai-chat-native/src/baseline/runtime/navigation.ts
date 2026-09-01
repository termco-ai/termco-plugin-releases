import type { EditorNavigationCapability } from "@termco/editor-base";

export type OpenFileDetail = {
  path: string;
  line?: number;
  column?: number;
};

let editorNavigation: EditorNavigationCapability | null = null;

export function aiEditorNavigationActive(): boolean {
  return editorNavigation !== null;
}

/** Connect rich chat references to the selected editor provider. */
export function configureEditorNavigation(
  editor: EditorNavigationCapability,
): () => void {
  editorNavigation = editor;
  return () => {
    if (editorNavigation === editor) editorNavigation = null;
  };
}

export function openFileFromBlock(
  path: string,
  line?: number,
  column?: number,
): void {
  if (!editorNavigation) {
    throw new Error("AI chat navigation is not connected to editor.navigation");
  }
  // The current public editor contract navigates by line. Keep accepting a
  // column in rich-view data so a future provider can support it compatibly.
  void column;
  if (line === undefined) editorNavigation.openFile(path, true);
  else editorNavigation.openFileAt(path, line, true);
}
