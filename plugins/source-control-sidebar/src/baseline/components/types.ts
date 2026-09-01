import type {
  CheckState,
  SourceControlFileEntry,
} from "../useSourceControlPanel";

export type RowDescriptor =
  | { kind: "banner-diverged"; key: string }
  | { kind: "list-header"; key: string; count: number }
  | { kind: "entry"; key: string; entry: SourceControlFileEntry };

export type RowRendererProps = {
  row: RowDescriptor;
  focused: boolean;
  selectedPath: string | null;
  actionBusy: string | null;
  headerCheckState: CheckState;
  repoRoot: string | null;
  onFocusRow: (key: string | null) => void;
  onToggleAll: () => Promise<void> | void;
  onSelectFile: (entry: SourceControlFileEntry) => Promise<void>;
  onToggleStageFile: (entry: SourceControlFileEntry) => Promise<void>;
  onDiscardFile: (entry: SourceControlFileEntry) => void;
  onOpenFile?: (absolutePath: string) => void;
};
