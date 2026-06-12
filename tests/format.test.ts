import { describe, expect, it } from "bun:test";
import { formatAgent, formatPost, formatSearch } from "../src/format";
import type { Agent, PostDetail, PostList } from "../src/client";

const LIST: PostList = {
  items: [{
    id: "p-1", title: "Bun socket.write() silently drops data", content_type: "til",
    agent_id: "a-1", agent_name: "drakulavich-agent", agent_is_top_contributor: false,
    tags: ["bun", "ipc"], vote_count: 3, reply_count: 1, view_count: 42,
    body_excerpt: "excerpt...", trust_summary: null,
    created_at: "2026-06-12T12:25:44Z", updated_at: "2026-06-12T12:25:44Z",
  }],
  total: 1, page: 1, per_page: 20, has_next: false,
};

describe("format", () => {
  it("formatSearch renders one line per hit with id, type, votes", () => {
    const text = formatSearch(LIST);
    expect(text).toContain("p-1");
    expect(text).toContain("[til]");
    expect(text).toContain("Bun socket.write()");
    expect(text).toContain("1 of 1");
  });

  it("formatSearch reports an empty result explicitly", () => {
    const text = formatSearch({ ...LIST, items: [], total: 0 });
    expect(text).toContain("no posts found");
    expect(text).not.toContain("page");
  });

  it("formatPost renders title, body, and replies", () => {
    const post: PostDetail = {
      ...LIST.items[0], body: "the full body",
      replies: [{
        id: "r-1", parent_id: "p-1", body: "a reply", agent_id: "a-2",
        agent_name: "other-agent", agent_is_top_contributor: false,
        vote_count: 0, trust_summary: null,
        created_at: "2026-06-12T13:00:00Z", updated_at: "2026-06-12T13:00:00Z",
      }],
    } as PostDetail;
    const text = formatPost(post);
    expect(text).toContain("the full body");
    expect(text).toContain("r-1");
    expect(text).toContain("other-agent");
  });

  it("formatPost with empty replies and tags does not emit reply section", () => {
    const post: PostDetail = {
      ...LIST.items[0], tags: [], body: "bare body", replies: [],
    } as PostDetail;
    const text = formatPost(post);
    expect(text).toContain("Bun socket.write()");
    expect(text).not.toContain("--- reply");
  });

  it("formatAgent renders identity and stats", () => {
    const agent: Agent = {
      id: "a-1", name: "drakulavich-agent", description: "d", persona: "p",
      avatar_type: "robot", agent_is_top_contributor: false,
      created_at: "2026-06-12T12:17:16Z",
      stats: {
        question_count: 0, answer_count: 0, blueprint_count: 0,
        til_count: 1, vote_count: 0, verification_count: 0, reputation: 0,
      },
    };
    const text = formatAgent(agent);
    expect(text).toContain("drakulavich-agent");
    expect(text).toContain("til: 1");
    expect(text).toContain("reputation: 0");
  });
});
