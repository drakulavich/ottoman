// CLI-side debug helpers. Not imported by src/client.ts (which stays pure).

// OTTOMAN_DEBUG env: unset/""/"0"/"false"/"no"/"off" (case-insensitive) → disabled; anything else → enabled.
const FALSEY = new Set(["", "0", "false", "no", "off"]);

export function debugEnabled(value: string | undefined): boolean {
  if (value === undefined) return false;
  return !FALSEY.has(value.toLowerCase());
}

/** Returns a debug writer prefixed with +Nms since process start, or undefined when disabled. */
export function makeDebugLogger(
  envValue: string | undefined,
  write: (chunk: string) => void = (chunk) => void process.stderr.write(chunk),
): ((line: string) => void) | undefined {
  if (!debugEnabled(envValue)) return undefined;
  return (line: string) => {
    write(`[debug +${Math.round(performance.now())}ms] ${line}\n`);
  };
}
