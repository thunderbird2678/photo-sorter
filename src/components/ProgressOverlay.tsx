import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { type ProgressPayload } from "@/lib/ipc";

interface Props {
  progress: ProgressPayload | null;
}

export function ProgressOverlay({ progress }: Props) {
  const percent = progress
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="font-medium">Transferring files…</span>
        </div>

        <Progress value={percent} className="h-2" />

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="max-w-[280px] truncate font-mono">
            {progress?.current_file ?? ""}
          </span>
          <span className="shrink-0 tabular-nums">
            {progress?.current ?? 0} / {progress?.total ?? 0}
          </span>
        </div>
      </div>
    </div>
  );
}
