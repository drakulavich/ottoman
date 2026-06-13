import { describe, expect, it } from "bun:test";
import { findForbiddenLinks } from "../src/links";

describe("findForbiddenLinks — allowed URLs", () => {
  it("allows https://stackoverflow.com URL", () => {
    expect(findForbiddenLinks("See https://stackoverflow.com/q/123")).toEqual([]);
  });

  it("allows https://agents.stackoverflow.com URL", () => {
    expect(findForbiddenLinks("See https://agents.stackoverflow.com/tils/x")).toEqual([]);
  });

  it("allows subdomain of stackexchange.com", () => {
    expect(findForbiddenLinks("See https://meta.stackexchange.com/q/1")).toEqual([]);
  });

  it("allows serverfault.com", () => {
    expect(findForbiddenLinks("See https://serverfault.com/q/1")).toEqual([]);
  });

  it("allows superuser.com", () => {
    expect(findForbiddenLinks("See https://superuser.com/q/1")).toEqual([]);
  });

  it("allows askubuntu.com", () => {
    expect(findForbiddenLinks("See https://askubuntu.com/q/1")).toEqual([]);
  });

  it("allows stackapps.com", () => {
    expect(findForbiddenLinks("See https://stackapps.com/q/1")).toEqual([]);
  });

  it("allows mathoverflow.net", () => {
    expect(findForbiddenLinks("See https://mathoverflow.net/q/1")).toEqual([]);
  });

  it("does not flag scheme-less text like requirements.txt", () => {
    expect(findForbiddenLinks("see requirements.txt and node.js for details")).toEqual([]);
  });

  it("does not flag bare words with dots", () => {
    expect(findForbiddenLinks("Use example.com as the domain name")).toEqual([]);
  });

  it("allows markdown link to stackoverflow.com", () => {
    expect(findForbiddenLinks("[answer](https://stackoverflow.com/a/42)")).toEqual([]);
  });
});

describe("findForbiddenLinks — forbidden URLs", () => {
  it("rejects file:// URL", () => {
    const violations = findForbiddenLinks("see file:///etc/passwd");
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("file://");
  });

  it("rejects data: URL", () => {
    const violations = findForbiddenLinks("data:text/html,<h1>hi</h1>");
    expect(violations.length).toBeGreaterThan(0);
    // message uses scheme: not scheme:// (data has no //)
    expect(violations[0]).toContain("data:");
    expect(violations[0]).not.toContain("data://");
  });

  it("rejects javascript: URL", () => {
    const violations = findForbiddenLinks("javascript:alert(1)");
    expect(violations.length).toBeGreaterThan(0);
    // message uses scheme: not scheme:// (javascript has no //)
    expect(violations[0]).toContain("javascript:");
    expect(violations[0]).not.toContain("javascript://");
  });

  it("case-insensitive: FILE:// is rejected", () => {
    const violations = findForbiddenLinks("FILE:///etc/passwd");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("rejects off-network https:// URL", () => {
    const violations = findForbiddenLinks("See https://evil.example.com/steal");
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("evil.example.com");
  });

  it("rejects off-network markdown link", () => {
    const violations = findForbiddenLinks("[click me](https://evil.example.com/x)");
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("evil.example.com");
  });

  it("rejects ftp:// URL to off-network host", () => {
    const violations = findForbiddenLinks("ftp://example.com/file.txt");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("rejects ws:// URL", () => {
    const violations = findForbiddenLinks("ws://example.com/socket");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("returns multiple violations", () => {
    const violations = findForbiddenLinks("file:///a and https://evil.com/b");
    expect(violations.length).toBe(2);
  });

  it("violation message is human-readable", () => {
    const [msg] = findForbiddenLinks("https://evil.example.com");
    expect(msg).toContain("off-network");
    expect(msg).toContain("evil.example.com");
  });

  // CRITICAL: userinfo-with-colon bypass — browser navigates to evil.com, not stackoverflow.com
  it("rejects userinfo bypass: https://stackoverflow.com:tok@evil.com/x", () => {
    const violations = findForbiddenLinks("https://stackoverflow.com:tok@evil.com/x");
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("evil.com");
  });

  it("rejects userinfo bypass with port: https://stackoverflow.com:443@evil.com/x", () => {
    const violations = findForbiddenLinks("https://stackoverflow.com:443@evil.com/x");
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("evil.com");
  });

  it("rejects userinfo bypass with subdomain: https://foo.stackoverflow.com:9@evil.com", () => {
    const violations = findForbiddenLinks("https://foo.stackoverflow.com:9@evil.com");
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("evil.com");
  });

  it("rejects Cyrillic-homograph host (punycode-normalised via URL constructor)", () => {
    // Cyrillic 'а' (U+0430) looks like Latin 'a' but is a different host
    const violations = findForbiddenLinks("https://stаckoverflow.com/q/1");
    expect(violations.length).toBeGreaterThan(0);
  });
});
