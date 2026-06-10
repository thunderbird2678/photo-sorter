export function normalizePathKey(p: string): string {
  const s = p.replace(/\\/g, "/");
  if (s === "/" || s === "") return "/";
  return s.replace(/\/+$/, "");
}

export function isStrictDescendant(
  ancestor: string,
  maybeDescendant: string,
): boolean {
  const a = normalizePathKey(ancestor);
  const b = normalizePathKey(maybeDescendant);
  if (a === b) return false;
  if (a === "/") return b !== "/";
  return b.startsWith(`${a}/`);
}

export function collapseToAncestors(paths: string[]): string[] {
  const uniq = [...new Set(paths)];
  return uniq.filter(
    (p) => !uniq.some((other) => p !== other && isStrictDescendant(other, p)),
  );
}

export interface RedundantAddition {
  attempted: string;
  parent: string;
}

function findInnermostEnclosingParent(
  current: string[],
  addition: string,
): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const c of current) {
    if (isStrictDescendant(c, addition)) {
      const len = normalizePathKey(c).length;
      if (len > bestLen) {
        best = c;
        bestLen = len;
      }
    }
  }
  return best;
}

/** New folders already covered by an existing source root (strict descendant of current). */
export function findRedundantAdditions(
  current: string[],
  additions: string[],
): RedundantAddition[] {
  const uniqAdd = [...new Set(additions)];
  const blocks: RedundantAddition[] = [];
  for (const add of uniqAdd) {
    if (current.some((c) => normalizePathKey(c) === normalizePathKey(add))) {
      continue;
    }
    const parent = findInnermostEnclosingParent(current, add);
    if (parent) blocks.push({ attempted: add, parent });
  }
  return blocks;
}

export type SourcePathMergeResult =
  | { conflict: false; next: string[] }
  | {
      conflict: true;
      next: string[];
      removedDescendants: string[];
      causingParents: string[];
    };

export function computeSourcePathMerge(
  current: string[],
  additions: string[],
): SourcePathMergeResult {
  const parentsAdded = [...new Set(additions)];
  const removed = new Set<string>();
  for (const add of parentsAdded) {
    for (const p of current) {
      if (isStrictDescendant(add, p)) removed.add(p);
    }
  }
  const removedDescendants = [...removed];
  const without = current.filter((p) => !removed.has(p));
  const next = collapseToAncestors([...without, ...parentsAdded]);

  if (removedDescendants.length === 0) {
    return { conflict: false, next };
  }

  const causingParents = parentsAdded.filter((add) =>
    current.some((p) => isStrictDescendant(add, p)),
  );

  return {
    conflict: true,
    next,
    removedDescendants,
    causingParents,
  };
}
