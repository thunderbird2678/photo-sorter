import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, FolderInput, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  computeSourcePathMerge,
  findRedundantAdditions,
  normalizePathKey,
  type RedundantAddition,
} from "@/lib/pathHierarchy";
import { type TransferMode } from "@/lib/ipc";
import { DescendantBlockedDialog } from "./PathInput/DescendantBlockedDialog";
import {
  ParentFolderConflictDialog,
  type ParentFolderConflictPayload,
} from "./PathInput/ParentFolderConflictDialog";
import { PathRow } from "./PathInput/PathRow";

interface Props {
  inputPaths: string[];
  outputPath: string;
  transferMode: TransferMode;
  addFolderDisabled?: boolean;
  onInputPathsChange: (paths: string[]) => void;
  onOutputPathChange: (path: string) => void;
  onTransferModeChange: (mode: TransferMode) => void;
}

export function PathInput({
  inputPaths,
  outputPath,
  transferMode,
  addFolderDisabled = false,
  onInputPathsChange,
  onOutputPathChange,
  onTransferModeChange,
}: Props) {
  const [parentConflict, setParentConflict] =
    useState<ParentFolderConflictPayload | null>(null);
  const [descendantBlocked, setDescendantBlocked] = useState<
    RedundantAddition[] | null
  >(null);

  async function addSourceFolder() {
    const selected = await open({ directory: true, multiple: true });
    if (!selected) return;
    const rawAdditions = Array.isArray(selected) ? selected : [selected];
    const additions = rawAdditions.map(normalizePathKey);
    const redundant = findRedundantAdditions(inputPaths, additions);
    if (redundant.length > 0) {
      setDescendantBlocked(redundant);
      return;
    }
    const merge = computeSourcePathMerge(inputPaths, additions);
    if (merge.conflict) {
      setParentConflict({
        next: merge.next,
        removedDescendants: merge.removedDescendants,
        causingParents: merge.causingParents,
      });
      return;
    }
    onInputPathsChange(merge.next);
  }

  async function pickOutputFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      onOutputPathChange(normalizePathKey(selected));
    }
  }

  function removeInput(index: number) {
    onInputPathsChange(inputPaths.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <DescendantBlockedDialog
        blocks={descendantBlocked}
        onDismiss={() => setDescendantBlocked(null)}
      />
      <ParentFolderConflictDialog
        conflict={parentConflict}
        onConfirm={(next) => {
          onInputPathsChange(next);
          setParentConflict(null);
        }}
        onDismiss={() => setParentConflict(null)}
      />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Source Folders</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={addFolderDisabled}
            onClick={addSourceFolder}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Folder
          </Button>
        </div>

        {inputPaths.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No source folders added yet
          </p>
        ) : (
          <div className="space-y-1.5">
            {inputPaths.map((path, index) => (
              <PathRow
                key={path}
                path={path}
                onRemove={() => removeInput(index)}
              />
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FolderInput className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Destination Folder</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          {outputPath ? (
            <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
              {outputPath}
            </span>
          ) : (
            <span className="flex-1 text-muted-foreground/60">
              No destination selected
            </span>
          )}
          {outputPath && (
            <button
              type="button"
              onClick={() => onOutputPathChange("")}
              className="cursor-pointer rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-destructive"
              aria-label="Clear destination folder"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={pickOutputFolder}
            className="cursor-pointer rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
            aria-label="Choose destination folder"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Transfer Mode</span>
        <div className="flex rounded-md border border-border">
          {(["copy", "move"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onTransferModeChange(mode)}
              className={`cursor-pointer px-4 py-1.5 text-sm capitalize transition-colors first:rounded-l-md last:rounded-r-md ${
                transferMode === mode
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
