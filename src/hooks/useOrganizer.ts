import { useState, useCallback, useRef } from "react";
import {
  startPreviewScan,
  cancelPreviewScan,
  onPreviewBatch,
  onPreviewDone,
  startDestinationScan,
  cancelDestinationScan,
  onDestinationStructure,
  onDestinationCounts,
  onDestinationDone,
  executeTransfer,
  onTransferProgress,
  type Preview,
  type DestinationScan,
  type TransferMode,
  type ProgressPayload,
  type PreviewFilePayload,
} from "@/lib/ipc";
import {
  mergeContributions,
  type SourceContributions,
} from "@/lib/previewContributions";

type Status = "idle" | "previewing" | "transferring" | "done" | "error";
type ScanMode = "replace" | "append";

interface OrganizerState {
  inputPaths: string[];
  outputPath: string;
  transferMode: TransferMode;
  preview: Preview | null;
  destinationScan: DestinationScan | null;
  progress: ProgressPayload | null;
  status: Status;
  errorMessage: string | null;
}

const initialState: OrganizerState = {
  inputPaths: [],
  outputPath: "",
  transferMode: "copy",
  preview: null,
  destinationScan: null,
  progress: null,
  status: "idle",
  errorMessage: null,
};

function recordContribution(
  bySource: SourceContributions,
  payload: PreviewFilePayload,
) {
  const { source, folder_path, file_name } = payload;
  let perSource = bySource[source];
  if (!perSource) {
    perSource = {};
    bySource[source] = perSource;
  }
  let perDay = perSource[folder_path];
  if (!perDay) {
    perDay = [];
    perSource[folder_path] = perDay;
  }
  perDay.push(file_name);
}

export function useOrganizer() {
  const [state, setState] = useState<OrganizerState>(initialState);
  const previewUnlistenRef = useRef<Array<() => void>>([]);
  const contributionsRef = useRef<SourceContributions>({});
  const mergedPreviewRef = useRef<Preview>({});
  const previewSessionRef = useRef(0);
  const previewChainRef = useRef(Promise.resolve());
  const scanningSourcesRef = useRef<Set<string>>(new Set());

  const destinationUnlistenRef = useRef<Array<() => void>>([]);
  const destinationSessionRef = useRef(0);
  const destinationStructureRef = useRef<Record<string, string[]>>({});
  const destinationCountsRef = useRef<Record<string, number>>({});

  function cleanupPreviewListeners() {
    previewUnlistenRef.current.forEach((fn) => fn());
    previewUnlistenRef.current = [];
  }

  function cleanupDestinationListeners() {
    destinationUnlistenRef.current.forEach((fn) => fn());
    destinationUnlistenRef.current = [];
  }

  function rebuildMergedFromContributions() {
    mergedPreviewRef.current = mergeContributions(contributionsRef.current);
  }

  // Invalidate FE-side scan state. We deliberately do NOT fire-and-forget a
  // BE cancel here: if a new scan is about to enqueue, the fire-and-forget
  // cancel can arrive on the BE *after* the new scan has started and kill it.
  // `startPreviewScan` already bumps the BE generation, which cancels any
  // prior scan implicitly. For the "stop with no follow-up" path, callers
  // use `cancelBackendScan()` explicitly.
  function invalidatePreviewWork() {
    previewSessionRef.current += 1;
    cleanupPreviewListeners();
    scanningSourcesRef.current.clear();
    previewChainRef.current = Promise.resolve();
  }

  function cancelBackendScan() {
    void cancelPreviewScan().catch(() => {});
  }

  function invalidateDestinationWork() {
    destinationSessionRef.current += 1;
    cleanupDestinationListeners();
    destinationStructureRef.current = {};
    destinationCountsRef.current = {};
  }

  function cancelBackendDestinationScan() {
    void cancelDestinationScan().catch(() => {});
  }

  const enqueuePreview = useCallback((work: () => Promise<void>) => {
    const next = previewChainRef.current.then(work);
    previewChainRef.current = next.catch(() => {});
  }, []);

  const setOutputPath = useCallback((path: string) => {
    setState((s) => ({ ...s, outputPath: path }));
  }, []);

  const setTransferMode = useCallback((mode: TransferMode) => {
    setState((s) => ({ ...s, transferMode: mode }));
  }, []);

  const runScan = useCallback(
    (paths: string[], mode: ScanMode) => {
      if (paths.length === 0) return;

      if (mode === "replace") {
        contributionsRef.current = {};
        rebuildMergedFromContributions();
      }

      enqueuePreview(async () => {
        const session = ++previewSessionRef.current;
        cleanupPreviewListeners();
        paths.forEach((p) => scanningSourcesRef.current.add(p));

        setState((s) => ({
          ...s,
          status: "previewing",
          preview: mode === "replace" ? null : { ...mergedPreviewRef.current },
          errorMessage: null,
        }));

        // Wait for any in-flight BE scan to be cancelled BEFORE we register
        // new listeners. Otherwise the old scan can slip a final batch through
        // to our fresh listeners (the session guard alone can't help because
        // the session is already the new one here).
        try {
          await cancelPreviewScan();
        } catch {
          // cancel failures are non-fatal; start will still bump the gen
        }
        if (session !== previewSessionRef.current) return;

        const unlistenBatch = await onPreviewBatch((batch) => {
          console.log("[preview] batch received", {
            size: Array.isArray(batch) ? batch.length : "NOT ARRAY",
            session,
            sessionRef: previewSessionRef.current,
            sample: Array.isArray(batch) ? batch[0] : batch,
          });
          if (session !== previewSessionRef.current) {
            console.warn("[preview] batch rejected: session mismatch");
            return;
          }
          for (const payload of batch) {
            recordContribution(contributionsRef.current, payload);
            const bucket =
              mergedPreviewRef.current[payload.folder_path] ??
              (mergedPreviewRef.current[payload.folder_path] = []);
            bucket.push(payload.file_name);
          }
          console.log(
            "[preview] merged keys after batch:",
            Object.keys(mergedPreviewRef.current),
          );
          setState((s) => ({
            ...s,
            preview: { ...mergedPreviewRef.current },
          }));
        });

        const unlistenDone = await onPreviewDone(({ finished }) => {
          console.log("[preview] done received", {
            finished,
            session,
            sessionRef: previewSessionRef.current,
          });
          if (session !== previewSessionRef.current) return;
          for (const p of finished) scanningSourcesRef.current.delete(p);
          if (scanningSourcesRef.current.size === 0) {
            cleanupPreviewListeners();
            setState((s) => ({
              ...s,
              status: "idle",
              preview: { ...mergedPreviewRef.current },
            }));
          }
        });

        previewUnlistenRef.current = [unlistenBatch, unlistenDone];

        try {
          await startPreviewScan(paths);
        } catch (err) {
          if (session !== previewSessionRef.current) return;
          cleanupPreviewListeners();
          setState((s) => ({
            ...s,
            status: "error",
            errorMessage: String(err),
          }));
        }
      });
    },
    [enqueuePreview],
  );

  const commitInputPathsChange = useCallback(
    (prev: string[], next: string[], outputPath: string) => {
      const added = next.filter((p) => !prev.includes(p));
      const removed = prev.filter((p) => !next.includes(p));

      if (added.length === 0 && removed.length === 0) {
        setState((s) => ({ ...s, inputPaths: next }));
        return;
      }

      if (removed.length === 0 && added.length > 0) {
        setState((s) => ({ ...s, inputPaths: next }));
        if (!outputPath) return;
        runScan(added, "append");
        return;
      }

      if (added.length === 0 && removed.length > 0) {
        const scanningSnapshot = new Set(scanningSourcesRef.current);

        invalidatePreviewWork();

        for (const p of removed) delete contributionsRef.current[p];

        // A surviving source is stale if either (a) it was still being scanned
        // when we cancelled, or (b) we never recorded any contributions for it
        // (e.g. a queued scan that never got to run).
        const needsRescan = next.filter(
          (p) => scanningSnapshot.has(p) || !contributionsRef.current[p],
        );
        for (const p of needsRescan) delete contributionsRef.current[p];

        rebuildMergedFromContributions();

        if (next.length === 0) {
          contributionsRef.current = {};
          rebuildMergedFromContributions();
          cancelBackendScan();
          setState((s) => ({
            ...s,
            inputPaths: next,
            preview: null,
            status: "idle",
          }));
          return;
        }

        if (needsRescan.length > 0 && outputPath) {
          setState((s) => ({
            ...s,
            inputPaths: next,
            preview: { ...mergedPreviewRef.current },
          }));
          runScan(needsRescan, "append");
          return;
        }

        cancelBackendScan();
        setState((s) => ({
          ...s,
          inputPaths: next,
          preview: { ...mergedPreviewRef.current },
          status: "idle",
        }));
        return;
      }

      // Mixed add + remove: full rescan is simplest and correct.
      invalidatePreviewWork();
      contributionsRef.current = {};
      rebuildMergedFromContributions();

      const stopScan = next.length === 0 || !outputPath;
      if (stopScan) {
        cancelBackendScan();
      }
      setState((s) => ({
        ...s,
        inputPaths: next,
        preview: null,
        ...(stopScan ? { status: "idle" as const } : {}),
      }));
      if (next.length > 0 && outputPath) {
        runScan(next, "replace");
      }
    },
    [runScan],
  );

  const runDestinationScan = useCallback(
    async (outputPath: string, inputPaths: string[] = []) => {
      invalidatePreviewWork();
      invalidateDestinationWork();
      contributionsRef.current = {};
      rebuildMergedFromContributions();

      setState((s) => ({
        ...s,
        destinationScan: outputPath ? null : s.destinationScan,
        preview: null,
      }));

      if (!outputPath) {
        cancelBackendScan();
        cancelBackendDestinationScan();
        return;
      }

      const session = ++destinationSessionRef.current;
      let previewKicked = false;
      const kickPreviewIfNeeded = () => {
        if (previewKicked) return;
        previewKicked = true;
        if (inputPaths.length > 0) {
          runScan(inputPaths, "replace");
        } else {
          cancelBackendScan();
        }
      };

      // Await the BE cancel before registering new listeners, same reasoning
      // as in `runScan`: prevents a prior destination scan from slipping a
      // final counts batch to our fresh listeners.
      try {
        await cancelDestinationScan();
      } catch {
        // non-fatal; start will still bump the gen
      }
      if (session !== destinationSessionRef.current) return;

      const unlistenStructure = await onDestinationStructure(
        ({ structure }) => {
          if (session !== destinationSessionRef.current) return;
          destinationStructureRef.current = structure;
          destinationCountsRef.current = {};
          setState((s) => ({
            ...s,
            destinationScan: { structure, file_counts: {} },
          }));
          // Kick the preview scan as soon as we know the destination
          // skeleton — preview and count-filling run in parallel from here.
          kickPreviewIfNeeded();
        },
      );

      const unlistenCounts = await onDestinationCounts(({ counts }) => {
        if (session !== destinationSessionRef.current) return;
        for (const [key, count] of counts) {
          destinationCountsRef.current[key] = count;
        }
        setState((s) => {
          if (!s.destinationScan) return s;
          return {
            ...s,
            destinationScan: {
              structure: s.destinationScan.structure,
              file_counts: { ...destinationCountsRef.current },
            },
          };
        });
      });

      const unlistenDone = await onDestinationDone(() => {
        if (session !== destinationSessionRef.current) return;
        cleanupDestinationListeners();
        // Defensive: if structure never arrived (shouldn't happen; the BE
        // always emits it at least once), still kick the preview so the
        // user isn't stuck.
        kickPreviewIfNeeded();
      });

      destinationUnlistenRef.current = [
        unlistenStructure,
        unlistenCounts,
        unlistenDone,
      ];

      try {
        await startDestinationScan(outputPath);
      } catch {
        if (session !== destinationSessionRef.current) return;
        cleanupDestinationListeners();
        setState((s) => ({
          ...s,
          destinationScan: { structure: {}, file_counts: {} },
        }));
        kickPreviewIfNeeded();
      }
    },
    [runScan],
  );

  const runTransfer = useCallback(
    async (inputPaths: string[], outputPath: string, mode: TransferMode) => {
      if (inputPaths.length === 0 || !outputPath) return;

      setState((s) => ({
        ...s,
        status: "transferring",
        progress: null,
        errorMessage: null,
      }));

      const unlisten = await onTransferProgress((payload) => {
        setState((s) => ({ ...s, progress: payload }));
      });

      try {
        await executeTransfer(inputPaths, outputPath, mode);
        setState((s) => ({ ...s, status: "done", progress: null }));
      } catch (err) {
        setState((s) => ({
          ...s,
          status: "error",
          errorMessage: String(err),
          progress: null,
        }));
      } finally {
        unlisten();
      }
    },
    [],
  );

  const reset = useCallback(() => {
    invalidatePreviewWork();
    invalidateDestinationWork();
    cancelBackendScan();
    cancelBackendDestinationScan();
    contributionsRef.current = {};
    rebuildMergedFromContributions();
    setState(initialState);
  }, []);

  return {
    ...state,
    commitInputPathsChange,
    setOutputPath,
    setTransferMode,
    runDestinationScan,
    runTransfer,
    reset,
  };
}
