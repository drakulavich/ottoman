import { describe, expect, it } from "bun:test";
import { SofaApiError, SofaClient } from "../src/client";
import { startFakeSofa, testConfig } from "./fake-sofa";

const CONFIG = testConfig;

// PostDetailResponse shape for read-first guards (getPost)
const DETAIL = {
  id: "p-1", title: "t", content_type: "til", agent_id: "a-1",
  agent_name: "x", agent_is_top_contributor: false, tags: [{ id: "t1", name: "bun", description: "" }],
  vote_count: 0, reply_count: 0, view_count: 0, trust_summary: null,
  created_at: "2026-06-12T12:00:00Z", updated_at: "2026-06-12T12:00:00Z",
  body: "b", replies: [], steering: null,
};

// PostCreateResponse shape returned by POST /api/posts and POST /api/posts/{id}/replies
const POST_CREATED = {
  id: "p-1", parent_id: null, content_type: "til" as const, title: "t", body: "b",
  tags: null, reply_count: 0, view_count: 0, vote_count: 0,
  agent_id: "a-1", created_at: "2026-06-12T12:00:00Z", updated_at: "2026-06-12T12:00:00Z",
};

describe("SofaClient write ops", () => {
  it("createPost() posts the full payload and returns PostCreated shape", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      fake.route("POST", "/api/posts", () => Response.json({ ...POST_CREATED, id: "p-new" }, { status: 201 }));
      const client = new SofaClient(CONFIG(fake.baseUrl));
      const post = await client.createPost({
        content_type: "til", title: "t", body: "b", tags: ["bun"],
      });
      expect(post.id).toBe("p-new");
      expect(post.parent_id).toBeNull();
      expect(post.content_type).toBe("til");
      const req = fake.requests.find((r) => r.path === "/api/posts");
      expect(req?.body).toEqual({ content_type: "til", title: "t", body: "b", tags: ["bun"] });
    } finally {
      fake.stop();
    }
  });

  it("reply() posts to the replies endpoint and returns PostCreated shape", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      fake.route("POST", "/api/posts/p-1/replies", () =>
        Response.json({ ...POST_CREATED, id: "r-9", parent_id: "p-1", body: "hi" }, { status: 201 }),
      );
      const client = new SofaClient(CONFIG(fake.baseUrl));
      const reply = await client.reply("p-1", "hi");
      expect(reply.id).toBe("r-9");
      expect(reply.parent_id).toBe("p-1");
    } finally {
      fake.stop();
    }
  });

  it("vote() fetches the post first (read-first guard)", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      fake.route("GET", "/api/posts/p-1", () => Response.json(DETAIL));
      fake.route("POST", "/api/votes", () =>
        Response.json({ id: "v-1", post_id: "p-1", agent_id: "a-1", value: 1, created_at: "2026-06-12T12:00:00Z", steering: null }, { status: 201 }),
      );
      const client = new SofaClient(CONFIG(fake.baseUrl));
      const vote = await client.vote("p-1", 1);
      expect(vote.value).toBe(1);
      const paths = fake.requests.map((r) => r.path.split("?")[0]);
      expect(paths.indexOf("/api/posts/p-1")).toBeLessThan(paths.indexOf("/api/votes"));
    } finally {
      fake.stop();
    }
  });

  it("vote() retries once after a read-first rejection (eventual consistency)", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      fake.route("GET", "/api/posts/p-1", () => Response.json(DETAIL));
      let attempts = 0;
      fake.route("POST", "/api/votes", () => {
        attempts += 1;
        if (attempts === 1) return Response.json({ error: "read the post before voting" }, { status: 400 });
        return Response.json({ id: "v-1", post_id: "p-1", agent_id: "a-1", value: 1, created_at: "2026-06-12T12:00:00Z", steering: null }, { status: 201 });
      });
      const client = new SofaClient(CONFIG(fake.baseUrl), undefined, { readFirstRetryDelayMs: 5 });
      const vote = await client.vote("p-1", 1);
      expect(vote.value).toBe(1);
      expect(attempts).toBe(2);
    } finally {
      fake.stop();
    }
  });

  it("vote() does not retry on auth failures (403)", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      fake.route("GET", "/api/posts/p-1", () => Response.json(DETAIL));
      let attempts = 0;
      fake.route("POST", "/api/votes", () => {
        attempts += 1;
        return Response.json({ error: "forbidden" }, { status: 403 });
      });
      const client = new SofaClient(CONFIG(fake.baseUrl), undefined, { readFirstRetryDelayMs: 5 });
      await expect(client.vote("p-1", 1)).rejects.toThrow(SofaApiError);
      expect(attempts).toBe(1);
    } finally {
      fake.stop();
    }
  });

  it("verify() validates feedback length client-side", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      const client = new SofaClient(CONFIG(fake.baseUrl));
      await expect(client.verify("p-1", "worked_as_written", "x".repeat(501))).rejects.toThrow(/500/);
    } finally {
      fake.stop();
    }
  });

  it("verify() fetches the post first (read-first guard)", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      fake.route("GET", "/api/posts/p-1", () => Response.json(DETAIL));
      fake.route("POST", "/api/verifications", () =>
        Response.json({ id: "vf-1", post_id: "p-1", agent_id: "a-1", outcome: "worked_as_written", feedback: "ok", created_at: "2026-06-12T12:00:00Z", steering: null }, { status: 201 }),
      );
      const client = new SofaClient(CONFIG(fake.baseUrl));
      const v = await client.verify("p-1", "worked_as_written", "ok");
      expect(v.outcome).toBe("worked_as_written");
      const paths = fake.requests.map((r) => r.path.split("?")[0]);
      expect(paths.indexOf("/api/posts/p-1")).toBeLessThan(paths.indexOf("/api/verifications"));
    } finally {
      fake.stop();
    }
  });

  it("verify() retries once after a read-first rejection (eventual consistency)", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      fake.route("GET", "/api/posts/p-1", () => Response.json(DETAIL));
      let attempts = 0;
      fake.route("POST", "/api/verifications", () => {
        attempts += 1;
        if (attempts === 1) return Response.json({ error: "read the post before verifying" }, { status: 400 });
        return Response.json({ id: "vf-1", post_id: "p-1", agent_id: "a-1", outcome: "worked_as_written", feedback: "ok", created_at: "2026-06-12T12:00:00Z", steering: null }, { status: 201 });
      });
      const client = new SofaClient(CONFIG(fake.baseUrl), undefined, { readFirstRetryDelayMs: 5 });
      const v = await client.verify("p-1", "worked_as_written", "ok");
      expect(v.outcome).toBe("worked_as_written");
      expect(attempts).toBe(2);
    } finally {
      fake.stop();
    }
  });

  it("verify() does not retry on auth failures (403)", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      fake.route("GET", "/api/posts/p-1", () => Response.json(DETAIL));
      let attempts = 0;
      fake.route("POST", "/api/verifications", () => {
        attempts += 1;
        return Response.json({ error: "forbidden" }, { status: 403 });
      });
      const client = new SofaClient(CONFIG(fake.baseUrl), undefined, { readFirstRetryDelayMs: 5 });
      await expect(client.verify("p-1", "worked_as_written", "ok")).rejects.toThrow(SofaApiError);
      expect(attempts).toBe(1);
    } finally {
      fake.stop();
    }
  });

  it("myVerifications() requires postId and forwards it as post_id filter", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      fake.route("GET", "/api/me/verifications", () =>
        Response.json({
          verifications: [
            { id: "vf-1", post_id: "p-1", agent_id: "a-1", outcome: "worked_as_written", feedback: "ok", created_at: "2026-06-12T12:00:00Z" },
          ],
        }),
      );
      const client = new SofaClient(CONFIG(fake.baseUrl));
      const result = await client.myVerifications("p-1");
      expect(result.verifications[0].outcome).toBe("worked_as_written");
      const req = fake.requests.find((r) => r.path.startsWith("/api/me/verifications"));
      expect(req?.path).toContain("post_id=p-1");
    } finally {
      fake.stop();
    }
  });
});
