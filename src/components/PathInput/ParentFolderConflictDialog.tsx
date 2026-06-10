import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface ParentFolderConflictPayload {
  next: string[];
  removedDescendants: string[];
  causingParents: string[];
}

interface Props {
  conflict: ParentFolderConflictPayload | null;
  onConfirm: (next: string[]) => void;
  onDismiss: () => void;
}

export function ParentFolderConflictDialog({
  conflict,
  onConfirm,
  onDismiss,
}: Props) {
  const open = conflict !== null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen: boolean) => {
        if (!nextOpen) onDismiss();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px]",
            "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0",
          )}
        />
        <Dialog.Popup
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[min(100vw-2rem,28rem)] -translate-x-1/2 -translate-y-1/2",
            "rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg outline-none",
            "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:fade-in-0 data-open:zoom-in-95",
          )}
        >
          <Dialog.Title className="text-sm font-semibold">
            Parent folder overlaps selected subfolders
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            {conflict && conflict.causingParents.length === 1 ? (
              <>
                Adding{" "}
                <span className="font-mono text-foreground/90">
                  {conflict.causingParents[0]}
                </span>{" "}
                replaces every selected folder inside it. Those subfolders will
                be removed from your source list and the parent will be scanned
                instead.
              </>
            ) : conflict && conflict.causingParents.length > 1 ? (
              <>
                Adding these parent folders replaces every selected subfolder
                nested under them. Those entries will be removed from your
                source list and the parents will be scanned instead.
              </>
            ) : null}
          </Dialog.Description>

          {conflict && conflict.causingParents.length > 1 && (
            <ul className="mt-3 max-h-24 list-inside list-disc space-y-0.5 overflow-y-auto font-mono text-xs text-foreground/90">
              {conflict.causingParents.map((p) => (
                <li key={p} className="truncate">
                  {p}
                </li>
              ))}
            </ul>
          )}

          {conflict && conflict.removedDescendants.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground">
                Subfolders that will be removed from the list (
                {conflict.removedDescendants.length})
              </p>
              <ScrollArea className="mt-1.5 h-32 rounded-md border border-border">
                <ul className="space-y-1 p-2 font-mono text-xs text-muted-foreground">
                  {conflict.removedDescendants.map((p) => (
                    <li key={p} className="break-all">
                      {p}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close
              render={
                <Button type="button" variant="outline" size="sm">
                  Cancel
                </Button>
              }
            />
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (conflict) onConfirm(conflict.next);
              }}
            >
              Use parent folder
              {conflict && conflict.causingParents.length > 1 ? "s" : ""}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
