import { useMemo, useState } from "react";
import { Loader2, FolderOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { type Preview, type DestinationScan } from "@/lib/ipc";
import { YearPane } from "./PreviewPanel/YearPane";
import { DayPane } from "./PreviewPanel/DayPane";
import { FilePane } from "./PreviewPanel/FilePane";

interface Props {
  outputPath: string;
  preview: Preview | null;
  destinationScan: DestinationScan | null;
  isScanning: boolean;
}

export interface MergedDayEntry {
  folderPath: string;
  day: string;
  isPlanned: boolean;
  isExisting: boolean;
  plannedFiles: string[];
  plannedCount: number;
  existingCount: number;
}

export interface MergedYearGroup {
  year: string;
  isExisting: boolean;
  plannedTotal: number;
  days: MergedDayEntry[];
}

function mergeStructure(
  preview: Preview | null,
  destinationScan: DestinationScan | null,
): MergedYearGroup[] {
  const allYears = new Set<string>();

  if (preview) {
    Object.keys(preview).forEach((p) => allYears.add(p.split("/")[0]));
  }
  if (destinationScan) {
    Object.keys(destinationScan.structure).forEach((y) => allYears.add(y));
  }

  return Array.from(allYears)
    .sort()
    .map((year) => {
      const allDayPaths = new Set<string>();

      if (preview) {
        Object.keys(preview)
          .filter((p) => p.startsWith(`${year}/`))
          .forEach((p) => allDayPaths.add(p));
      }

      const existingDays = destinationScan?.structure[year] ?? [];
      existingDays.forEach((day) => allDayPaths.add(`${year}/${day}`));

      const days: MergedDayEntry[] = Array.from(allDayPaths)
        .sort()
        .map((folderPath) => {
          const day = folderPath.split("/")[1];
          const plannedFiles = preview?.[folderPath] ?? [];
          return {
            folderPath,
            day,
            isPlanned: plannedFiles.length > 0,
            isExisting: existingDays.includes(day),
            plannedFiles,
            plannedCount: plannedFiles.length,
            existingCount: destinationScan?.file_counts[folderPath] ?? 0,
          };
        });

      return {
        year,
        isExisting: !!destinationScan?.structure[year],
        plannedTotal: days.reduce((sum, d) => sum + d.plannedCount, 0),
        days,
      };
    });
}

export function PreviewPanel({
  outputPath,
  preview,
  destinationScan,
  isScanning,
}: Props) {
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const yearGroups = useMemo(
    () => mergeStructure(preview, destinationScan),
    [preview, destinationScan],
  );
  const totalFiles = yearGroups.reduce((sum, g) => sum + g.plannedTotal, 0);
  const plannedDayCount = yearGroups.reduce(
    (sum, g) => sum + g.days.filter((d) => d.isPlanned).length,
    0,
  );

  const defaultYear =
    yearGroups.find((g) => g.plannedTotal > 0)?.year ??
    yearGroups[0]?.year ??
    null;
  const effectiveYear = selectedYear ?? defaultYear;

  const selectedYearGroup = yearGroups.find((g) => g.year === effectiveYear);

  const defaultDay =
    selectedYearGroup?.days.find((d) => d.isPlanned && !d.isExisting)
      ?.folderPath ??
    selectedYearGroup?.days[0]?.folderPath ??
    null;
  const effectiveDay = selectedDay ?? defaultDay;

  const selectedDayEntry = selectedYearGroup?.days.find(
    (d) => d.folderPath === effectiveDay,
  );

  function handleYearSelect(year: string) {
    setSelectedYear(year);
    setSelectedDay(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Organization Preview</span>
        <div className="flex items-center gap-2">
          {isScanning && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          {totalFiles > 0 && (
            <span className="text-sm text-muted-foreground">
              {totalFiles.toLocaleString()}{" "}
              {totalFiles === 1 ? "file" : "files"} across {plannedDayCount}{" "}
              {plannedDayCount === 1 ? "day" : "days"}
            </span>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/30 px-3 py-1.5">
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-xs text-muted-foreground">
            {outputPath}
          </span>
        </div>

        {destinationScan === null ? (
          <PreviewSkeleton />
        ) : (
          <div className="flex h-72 divide-x divide-border">
            <div className="w-40 shrink-0">
              <YearPane
                yearGroups={yearGroups}
                selectedYear={effectiveYear}
                onSelect={handleYearSelect}
              />
            </div>
            <div className="min-w-0 flex-1">
              <DayPane
                days={selectedYearGroup?.days ?? []}
                selectedDay={effectiveDay}
                scrollKey={effectiveYear ?? ""}
                onSelect={setSelectedDay}
              />
            </div>
            <div className="min-w-0 flex-1">
              <FilePane
                key={effectiveDay ?? "none"}
                files={selectedDayEntry?.plannedFiles ?? []}
                dayLabel={effectiveDay}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="flex h-72 divide-x divide-border">
      <div className="w-40 shrink-0 space-y-1.5 p-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full rounded" />
        ))}
      </div>
      <div className="w-48 shrink-0 space-y-1.5 p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full rounded" />
        ))}
      </div>
      <div className="flex-1 space-y-1.5 p-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-5 rounded"
            style={{ width: `${60 + (i % 3) * 15}%` }}
          />
        ))}
      </div>
    </div>
  );
}
