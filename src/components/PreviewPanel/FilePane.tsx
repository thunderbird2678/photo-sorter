import { FileImage } from "lucide-react";
import { Virtuoso } from "react-virtuoso";

interface Props {
  files: string[];
  dayLabel: string | null;
}

export function FilePane({ files, dayLabel }: Props) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {files.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground/60">
          {dayLabel ? "No files being added" : ""}
        </p>
      ) : (
        <Virtuoso
          className="min-h-0 flex-1"
          data={files}
          increaseViewportBy={200}
          itemContent={(_index, name) => (
            <div className="flex items-center gap-1.5 rounded px-2 py-1 font-mono text-xs text-muted-foreground">
              <FileImage className="h-3 w-3 shrink-0 text-muted-foreground/50" />
              <span className="truncate">{name}</span>
            </div>
          )}
        />
      )}
    </div>
  );
}
