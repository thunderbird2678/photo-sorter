import type { Preview } from "@/lib/ipc";

export type SourceContributions = Record<string, Preview>;

export function mergeContributions(sources: SourceContributions): Preview {
  const out: Preview = {};
  for (const prev of Object.values(sources)) {
    for (const [day, files] of Object.entries(prev)) {
      if (!out[day]) out[day] = [];
      out[day].push(...files);
    }
  }
  return out;
}
