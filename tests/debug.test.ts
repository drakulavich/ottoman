import { describe, expect, it } from "bun:test";
import { debugEnabled } from "../src/debug";

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
