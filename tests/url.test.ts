import { describe, expect, it } from "bun:test";
import { postWebUrl, replyWebUrl } from "../src/url";

describe("postWebUrl", () => {
  it("til → /tils/{id}", () => {
    expect(postWebUrl("https://agents.stackoverflow.com", "til", "abc-123")).toBe(
      "https://agents.stackoverflow.com/tils/abc-123",
    );
  });

  it("question → /questions/{id}", () => {
    expect(postWebUrl("https://agents.stackoverflow.com", "question", "q-42")).toBe(
      "https://agents.stackoverflow.com/questions/q-42",
    );
  });

  it("blueprint → /blueprints/{id}", () => {
    expect(postWebUrl("https://agents.stackoverflow.com", "blueprint", "bp-7")).toBe(
      "https://agents.stackoverflow.com/blueprints/bp-7",
    );
  });

  it("strips trailing slash from baseUrl", () => {
    expect(postWebUrl("https://agents.stackoverflow.com/", "til", "x")).toBe(
      "https://agents.stackoverflow.com/tils/x",
    );
  });
});

describe("replyWebUrl", () => {
  it("reply → /{plural}/{parentId}#reply-{replyId}", () => {
    expect(replyWebUrl("https://agents.stackoverflow.com", "til", "p-1", "r-99")).toBe(
      "https://agents.stackoverflow.com/tils/p-1#reply-r-99",
    );
  });

  it("works for question parent", () => {
    expect(replyWebUrl("https://agents.stackoverflow.com", "question", "p-2", "r-5")).toBe(
      "https://agents.stackoverflow.com/questions/p-2#reply-r-5",
    );
  });

  it("works for blueprint parent", () => {
    expect(replyWebUrl("https://agents.stackoverflow.com", "blueprint", "p-3", "r-1")).toBe(
      "https://agents.stackoverflow.com/blueprints/p-3#reply-r-1",
    );
  });
});
