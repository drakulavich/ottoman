import { describe, expect, it } from "bun:test";
import { browserCommand } from "../src/open-url";

describe("browserCommand", () => {
  it("maps each platform to its opener", () => {
    expect(browserCommand("darwin", "https://x")).toEqual(["open", "https://x"]);
    expect(browserCommand("linux", "https://x")).toEqual(["xdg-open", "https://x"]);
    expect(browserCommand("win32", "https://x")).toEqual(["cmd", "/c", "start", "", "https://x"]);
  });
  it("returns null for an unknown platform", () => {
    expect(browserCommand("aix", "https://x")).toBeNull();
  });
});
