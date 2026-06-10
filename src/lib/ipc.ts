import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type Preview = Record<string, string[]>;

export type TransferMode = "copy" | "move";

export interface ProgressPayload {
  current: number;
  total: number;
  current_file: string;
}

export interface PreviewFilePayload {
  folder_path: string;
  file_name: string;
  source: string;
}

export interface PreviewDonePayload {
  finished: string[];
}

export interface DestinationScan {
  structure: Record<string, string[]>;
  file_counts: Record<string, number>;
}

export function scanDestination(output: string): Promise<DestinationScan> {
  return invoke<DestinationScan>("scan_destination", { output });
}

export interface DestinationStructurePayload {
  structure: Record<string, string[]>;
}

export interface DestinationCountsPayload {
  counts: Array<[string, number]>;
}

export function startDestinationScan(output: string): Promise<void> {
  return invoke<void>("start_destination_scan", { output });
}

export function cancelDestinationScan(): Promise<void> {
  return invoke<void>("cancel_destination_scan");
}

export function onDestinationStructure(
  handler: (payload: DestinationStructurePayload) => void,
): Promise<UnlistenFn> {
  return listen<DestinationStructurePayload>(
    "destination://structure",
    (event) => handler(event.payload),
  );
}

export function onDestinationCounts(
  handler: (payload: DestinationCountsPayload) => void,
): Promise<UnlistenFn> {
  return listen<DestinationCountsPayload>("destination://counts", (event) =>
    handler(event.payload),
  );
}

export function onDestinationDone(handler: () => void): Promise<UnlistenFn> {
  return listen<null>("destination://done", () => handler());
}

export interface WalThemes {
  light: Record<string, string>;
  dark: Record<string, string>;
}

export function getWalThemes(): Promise<WalThemes | null> {
  return invoke<WalThemes | null>("get_wal_themes");
}

export function startPreviewScan(inputs: string[]): Promise<void> {
  return invoke<void>("start_preview_scan", { inputs });
}

export function cancelPreviewScan(): Promise<void> {
  return invoke<void>("cancel_preview_scan");
}

export function onPreviewBatch(
  handler: (batch: PreviewFilePayload[]) => void,
): Promise<UnlistenFn> {
  return listen<PreviewFilePayload[]>("preview://batch", (event) =>
    handler(event.payload),
  );
}

export function onPreviewDone(
  handler: (payload: PreviewDonePayload) => void,
): Promise<UnlistenFn> {
  return listen<PreviewDonePayload>("preview://done", (event) =>
    handler(event.payload),
  );
}

export function executeTransfer(
  inputs: string[],
  output: string,
  mode: TransferMode,
): Promise<void> {
  return invoke<void>("execute_transfer", { inputs, output, mode });
}

export function onTransferProgress(
  handler: (payload: ProgressPayload) => void,
): Promise<UnlistenFn> {
  return listen<ProgressPayload>("transfer://progress", (event) =>
    handler(event.payload),
  );
}
