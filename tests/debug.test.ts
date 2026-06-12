import { describe, expect, it } from "bun:test";
import { debugEnabled, makeDebugLogger } from "../src/debug";

describe("debugEnabled", () => {
  const cases: [string | undefined, boolean][] = [
    [undefined, false],
    ["", false],
    ["0", false],
    ["false", false],
    ["FALSE", false],
    ["no", false],
    ["off", false],
    ["1", true],
    ["true", true],
    ["verbose", true],
  ];

  for (const [input, expected] of cases) {
    it(`debugEnabled(${JSON.stringify(input)}) === ${expected}`, () => {
      expect(debugEnabled(input)).toBe(expected);
    });
  }
});

describe("makeDebugLogger", () => {
  it("returns undefined when disabled", () => {
    expect(makeDebugLogger(undefined)).toBeUndefined();
    expect(makeDebugLogger("off")).toBeUndefined();
  });

  it("writes prefixed lines to stderr when enabled", () => {
    const written: string[] = [];
    const realWrite = process.stderr.write;
    process.stderr.write = ((chunk: string) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      const log = makeDebugLogger("1");
      expect(log).toBeDefined();
      log!("GET /api/tags → 200 (6ms)");
    } finally {
      process.stderr.write = realWrite;
    }
    expect(written).toHaveLength(1);
    expect(written[0]).toMatch(/^\[debug \+\d+ms\] GET \/api\/tags → 200 \(6ms\)\n$/);
  });
});
