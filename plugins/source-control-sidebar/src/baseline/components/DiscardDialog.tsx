import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@termco/ui";
import type { PendingDiscard } from "../useSourceControlPanel";

export function DiscardDialog({
  pendingDiscard,
  onCancel,
  onConfirm,
}: {
  pendingDiscard: PendingDiscard | null;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  return (
    <AlertDialog
      open={pendingDiscard !== null}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingDiscard?.scope === "all"
              ? `This will discard ${pendingDiscard.label} and cannot be undone.`
              : pendingDiscard
                ? `Discard changes in "${pendingDiscard.label}"? This cannot be undone.`
                : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onCancel()}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => void onConfirm()}>
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
