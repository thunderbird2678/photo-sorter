import { FolderOpen, FolderPlus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type MergedYearGroup } from "@/components/PreviewPanel";

interface Props {
  yearGroups: MergedYearGroup[];
  selectedYear: string | null;
  onSelect: (year: string) => void;
}

export function YearPane({ yearGroups, selectedYear, onSelect }: Props) {
  return (
    <ScrollArea className="h-full min-h-0">
      <div className="p-1">
        {yearGroups.map((group) => {
          const isSelected = group.year === selectedYear;
          const isNew = !group.isExisting;

          return (
            <button
              key={group.year}
              type="button"
              onClick={() => onSelect(group.year)}
              className={`flex w-full cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-left font-mono text-sm transition-colors ${
                isSelected
                  ? "bg-primary/12 ring-1 ring-primary/25 ring-inset"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              {isNew ? (
                <FolderPlus className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              )}
              <span
                className={`min-w-0 flex-1 truncate ${isNew ? "font-medium text-primary" : ""}`}
              >
                {group.year}
              </span>
              {group.plannedTotal > 0 && (
                <span
                  className={`shrink-0 text-xs tabular-nums ${isSelected ? "text-muted-foreground" : "text-muted-foreground/60"}`}
                >
                  ({group.plannedTotal})
                </span>
              )}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
