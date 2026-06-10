import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  path: string;
  onRemove: () => void;
}

export function PathRow({ path, onRemove }: Props) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
        {path}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        aria-label="Remove path"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
