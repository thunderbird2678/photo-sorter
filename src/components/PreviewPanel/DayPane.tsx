import { useLayoutEffect, useRef } from "react";
import { Folder, FolderPlus, TriangleAlert } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type MergedDayEntry } from "@/components/PreviewPanel";

interface Props {
  days: MergedDayEntry[];
  selectedDay: string | null;
  scrollKey: string;
  onSelect: (folderPath: string) => void;
}

export function DayPane({ days, selectedDay, scrollKey, onSelect }: Props) {
  const firstPlannedRef = useRef<HTMLButtonElement | null>(null);

  // Pure DOM scroll — no setState, justified use of useLayoutEffect.
  // Fires after every render where scrollKey changes (year selection or initial load),
  // scrolling the first planned day into view within the ScrollArea viewport.
  useLayoutEffect(() => {
    firstPlannedRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "instant",
    });
  }, [scrollKey]);

  let firstPlannedSeen = false;

  return (
    <ScrollArea className="h-full min-h-0">
      <div className="p-1">
        {days.map((entry, i) => {
          const isSelected = entry.folderPath === selectedDay;
          const isNew = !entry.isExisting;
          const hasConflict = entry.isPlanned && entry.existingCount > 0;

          const isFirstPlanned = entry.isPlanned && !firstPlannedSeen;
          if (isFirstPlanned) firstPlannedSeen = true;

          return (
            <button
              key={entry.folderPath}
              ref={isFirstPlanned ? firstPlannedRef : null}
              type="button"
              onClick={() => onSelect(entry.folderPath)}
              className={`flex w-full cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-left font-mono text-xs transition-colors ${
                isSelected
                  ? "bg-primary/12 ring-1 ring-primary/25 ring-inset"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <span className="text-border">
                {i === days.length - 1 ? "└─" : "├─"}
              </span>
              {isNew ? (
                <FolderPlus className="h-3 w-3 shrink-0 text-primary" />
              ) : (
                <Folder className="h-3 w-3 shrink-0" />
              )}
              <span
                className={`flex-1 truncate ${isNew && entry.isPlanned ? "text-primary" : ""}`}
              >
                {entry.day}
              </span>
              {hasConflict && (
                <Tooltip>
                  <TooltipTrigger>
                    <TriangleAlert className="h-3 w-3 shrink-0 cursor-default text-amber-500" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    {entry.existingCount} existing{" "}
                    {entry.existingCount === 1 ? "file" : "files"} in this
                    folder. Same-named files are skipped—nothing is overwritten.
                  </TooltipContent>
                </Tooltip>
              )}
              {entry.isPlanned && (
                <span
                  className={`shrink-0 text-xs tabular-nums ${isSelected ? "text-muted-foreground" : "text-muted-foreground/60"}`}
                >
                  ({entry.plannedCount})
                </span>
              )}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
