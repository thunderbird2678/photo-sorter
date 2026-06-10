import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Moon,
  RotateCcw,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PathInput } from "@/components/PathInput";
import { PreviewPanel } from "@/components/PreviewPanel";
import { ProgressOverlay } from "@/components/ProgressOverlay";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useTheme } from "@/hooks/useTheme";

export default function App() {
  const { theme, toggleTheme } = useTheme();

  const {
    inputPaths,
    outputPath,
    transferMode,
    preview,
    destinationScan,
    progress,
    status,
    errorMessage,
    commitInputPathsChange,
    setOutputPath,
    setTransferMode,
    runDestinationScan,
    runTransfer,
    reset,
  } = useOrganizer();

  const isPreviewing = status === "previewing";
  const isTransferring = status === "transferring";
  const isDone = status === "done";
  const isError = status === "error";
  const isBusy = isPreviewing || isTransferring;

  const canExecute =
    preview !== null &&
    Object.keys(preview).length > 0 &&
    outputPath !== "" &&
    !isBusy;

  function handleInputPathsChange(paths: string[]) {
    commitInputPathsChange(inputPaths, paths, outputPath);
  }

  function handleOutputPathChange(path: string) {
    setOutputPath(path);
    runDestinationScan(path, inputPaths);
  }

  const showPreview = outputPath !== "";

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 text-foreground">
        {isTransferring && <ProgressOverlay progress={progress} />}

        <div className="flex w-full max-w-3xl flex-col">
          <header className="border-b border-border">
            <div className="flex items-center gap-3 px-6 py-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Camera className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h1 className="text-sm font-semibold leading-none">
                  Photo Sorter
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Organize photos by EXIF date into Year / Day folders
                </p>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                aria-label={
                  theme === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"
                }
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
            </div>
          </header>

          <main className="flex flex-col">
            <div className="flex flex-col gap-6 px-6 py-6">
              {isDone ? (
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
                    <CheckCircle2 className="h-7 w-7 text-green-500" />
                  </div>
                  <div>
                    <p className="font-semibold">All done!</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Your photos have been organized successfully.
                    </p>
                  </div>
                  <Button variant="outline" onClick={reset}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Start Over
                  </Button>
                </div>
              ) : (
                <>
                  <PathInput
                    inputPaths={inputPaths}
                    outputPath={outputPath}
                    transferMode={transferMode}
                    addFolderDisabled={isPreviewing}
                    onInputPathsChange={handleInputPathsChange}
                    onOutputPathChange={handleOutputPathChange}
                    onTransferModeChange={setTransferMode}
                  />

                  {isError && (
                    <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {showPreview && (
                    <>
                      <Separator />
                      <PreviewPanel
                        outputPath={outputPath}
                        preview={preview}
                        destinationScan={destinationScan}
                        isScanning={isPreviewing}
                      />
                    </>
                  )}
                </>
              )}
            </div>
          </main>

          {!isDone && (
            <footer className="border-t border-border">
              <div className="flex items-center justify-end px-6 py-4">
                <Button
                  disabled={!canExecute}
                  onClick={() =>
                    runTransfer(inputPaths, outputPath, transferMode)
                  }
                >
                  {isTransferring ? "Transferring…" : "Execute"}
                </Button>
              </div>
            </footer>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
