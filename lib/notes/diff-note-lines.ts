// Lightweight whitespace-aware LCS diff for note lines
// - Trims trailing blank lines on both sides
// - Uses normalization for equality (collapse whitespace + trim)

export type DiffOp =
  | { op: "equal"; oldIndex: number; newIndex: number; textEqual: boolean }
  | { op: "replace"; oldIndex: number; newIndex: number }
  | { op: "insert"; newIndex: number }
  | { op: "delete"; oldIndex: number };

export interface DiffResult {
  ops: DiffOp[];
}

export function trimTrailingBlanks(lines: string[]): string[] {
  let end = lines.length - 1;
  while (end >= 0 && lines[end].trim() === "") end--;
  return lines.slice(0, end + 1);
}

export function defaultNormalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// Compute LCS table for two arrays of strings (already normalized)
function lcsTable(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

// Backtrack LCS to get list of matching index pairs (oldIndex, newIndex), left-to-right
function lcsPairs(a: string[], b: string[], dp: number[][]): Array<{ oldIndex: number; newIndex: number }> {
  const pairs: Array<{ oldIndex: number; newIndex: number }> = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      pairs.push({ oldIndex: i - 1, newIndex: j - 1 });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  pairs.reverse();
  return pairs;
}

// Main diff: emits equal/replace/insert/delete, using LCS to anchor equality blocks.
export function diffNoteLines(
  oldLines: string[],
  newLines: string[],
  opts?: { normalize?: (s: string) => string }
): DiffResult {
  const normalize = opts?.normalize ?? defaultNormalize;

  const oldTrimmed = trimTrailingBlanks(oldLines);
  const newTrimmed = trimTrailingBlanks(newLines);

  const oldNorm = oldTrimmed.map(normalize);
  const newNorm = newTrimmed.map(normalize);

  const dp = lcsTable(oldNorm, newNorm);
  const pairs = lcsPairs(oldNorm, newNorm, dp);

  const ops: DiffOp[] = [];

  let prevOld = -1;
  let prevNew = -1;

  function processGap(oldStart: number, oldEnd: number, newStart: number, newEnd: number) {
    // Inclusive ranges if start <= end; otherwise empty
    const oldCount = oldEnd >= oldStart ? oldEnd - oldStart + 1 : 0;
    const newCount = newEnd >= newStart ? newEnd - newStart + 1 : 0;

    // If both sides have exactly one line, we can decide between equal/replace
    if (oldCount === 1 && newCount === 1) {
      const oi = oldStart;
      const nj = newStart;
      const exactEq = oldTrimmed[oi] === newTrimmed[nj];
      if (exactEq) {
        ops.push({ op: "equal", oldIndex: oi, newIndex: nj, textEqual: true });
      } else if (normalize(oldTrimmed[oi]) === normalize(newTrimmed[nj])) {
        // Whitespace-only change: treat as equal (no update)
        ops.push({ op: "equal", oldIndex: oi, newIndex: nj, textEqual: false });
      } else {
        // Real content change: replace
        ops.push({ op: "replace", oldIndex: oi, newIndex: nj });
      }
      return;
    }

    // Otherwise, avoid pairing ambiguous blocks: emit inserts then deletes
    for (let nj = newStart; nj <= newEnd; nj++) {
      if (newEnd >= newStart) ops.push({ op: "insert", newIndex: nj });
    }
    for (let oi = oldStart; oi <= oldEnd; oi++) {
      if (oldEnd >= oldStart) ops.push({ op: "delete", oldIndex: oi });
    }
  }

  for (const { oldIndex: oi, newIndex: nj } of pairs) {
    processGap(prevOld + 1, oi - 1, prevNew + 1, nj - 1);
    const exactlyEqual = oldTrimmed[oi] === newTrimmed[nj];
    ops.push({ op: "equal", oldIndex: oi, newIndex: nj, textEqual: exactlyEqual });
    prevOld = oi;
    prevNew = nj;
  }

  // Tail gap
  processGap(prevOld + 1, oldTrimmed.length - 1, prevNew + 1, newTrimmed.length - 1);

  return { ops };
}
