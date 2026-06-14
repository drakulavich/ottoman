import { describe, expect, it } from "bun:test";
import { findLimitViolations, LIMITS } from "../src/limits";

describe("findLimitViolations", () => {
  it("passes when everything is within limits", () => {
    expect(
      findLimitViolations({ title: "ok", body: "hi", bodyKind: "post", tags: ["a", "b"] }),
    ).toEqual([]);
  });

  it("flags an over-length title", () => {
    const v = findLimitViolations({ title: "x".repeat(LIMITS.title + 1) });
    expect(v).toHaveLength(1);
    expect(v[0]).toContain("title");
    expect(v[0]).toContain(String(LIMITS.title));
  });

  it("title exactly at the limit is allowed", () => {
    expect(findLimitViolations({ title: "x".repeat(LIMITS.title) })).toEqual([]);
  });

  it("post body cap is 50000, reply body cap is 25000", () => {
    expect(findLimitViolations({ body: "x".repeat(LIMITS.postBody + 1), bodyKind: "post" })).toHaveLength(1);
    expect(findLimitViolations({ body: "x".repeat(LIMITS.postBody), bodyKind: "post" })).toEqual([]);
    expect(findLimitViolations({ body: "x".repeat(LIMITS.replyBody + 1), bodyKind: "reply" })).toHaveLength(1);
    // a body that fits a post but not a reply is flagged only as a reply
    expect(findLimitViolations({ body: "x".repeat(LIMITS.replyBody + 1), bodyKind: "post" })).toEqual([]);
  });

  it("flags over-length feedback (the 500-char verify cap)", () => {
    const v = findLimitViolations({ feedback: "x".repeat(LIMITS.feedback + 1) });
    expect(v).toHaveLength(1);
    expect(v[0]).toContain("feedback");
    expect(v[0]).toContain("500");
  });

  it("flags too many tags", () => {
    const v = findLimitViolations({ tags: Array.from({ length: LIMITS.tags + 1 }, (_, i) => `t${i}`) });
    expect(v.some((m) => m.includes("tags"))).toBe(true);
  });

  it("flags an over-length single tag", () => {
    const v = findLimitViolations({ tags: ["ok", "y".repeat(LIMITS.tagLength + 1)] });
    expect(v.some((m) => m.includes("tag") && m.includes(String(LIMITS.tagLength)))).toBe(true);
  });

  it("counts Unicode by code point, not UTF-16 length", () => {
    // 200 emoji = 200 code points (400 UTF-16 units). Must be allowed at the 200 cap.
    expect(findLimitViolations({ title: "🙂".repeat(LIMITS.title) })).toEqual([]);
    expect(findLimitViolations({ title: "🙂".repeat(LIMITS.title + 1) })).toHaveLength(1);
  });

  it("reports multiple violations at once", () => {
    const v = findLimitViolations({
      title: "x".repeat(LIMITS.title + 1),
      feedback: "y".repeat(LIMITS.feedback + 1),
    });
    expect(v.length).toBe(2);
  });
});
