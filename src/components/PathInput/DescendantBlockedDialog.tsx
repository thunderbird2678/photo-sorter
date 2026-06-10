import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { type RedundantAddition } from "@/lib/pathHierarchy";

interface Props {
  blocks: RedundantAddition[] | null;
  onDismiss: () => void;
}

export function DescendantBlockedDialog({ blocks, onDismiss }: Props) {
  const open = blocks !== null && blocks.length > 0;

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
          <Dialog.Title className="text-sm font-semibold text-destructive">
            Folder already covered
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            {blocks && blocks.length === 1 ? (
              <>
                You can&apos;t add{" "}
                <span className="font-mono text-foreground/90">
                  {blocks[0].attempted}
                </span>{" "}
                because it&apos;s already inside{" "}
                <span className="font-mono text-foreground/90">
                  {blocks[0].parent}
                </span>
                , which is already in your source list. Those files are already
                included.
              </>
            ) : (
              <>
                You can&apos;t add these folders because each one is already
                inside a parent you&apos;ve selected. Nothing new would be
                scanned.
              </>
            )}
          </Dialog.Description>

          {blocks && blocks.length > 1 && (
            <ScrollArea className="mt-3 h-32 rounded-md border border-border">
              <ul className="space-y-2 p-2 text-xs">
                {blocks.map(({ attempted, parent }) => (
                  <li key={`${attempted}\0${parent}`}>
                    <div className="font-mono text-muted-foreground break-all">
                      {attempted}
                    </div>
                    <div className="text-muted-foreground">
                      already under{" "}
                      <span className="font-mono text-foreground/80">
                        {parent}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}

          <div className="mt-4 flex justify-end">
            <Dialog.Close
              render={
                <Button type="button" size="sm">
                  OK
                </Button>
              }
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
