import { describe, expect, it } from "bun:test";
import { startFakeSofa } from "./fake-sofa";
import { MemorySessionStore, SofaApiError, SofaClient } from "../src/client";

describe("fake-sofa helper", () => {
  it("serves injected routes and records requests", async () => {
    const fake = startFakeSofa();
    try {
      fake.route("GET", "/api/tags", () => Response.json({ items: [] }));
      const res = await fetch(`${fake.baseUrl}/api/tags`, {
        headers: { Authorization: "Bearer k" },
      });
      expect(res.status).toBe(200);
      expect(fake.requests).toHaveLength(1);
      expect(fake.requests[0].headers["authorization"]).toBe("Bearer k");
      const miss = await fetch(`${fake.baseUrl}/api/nope`);
      expect(miss.status).toBe(500);
    } finally {
      fake.stop();
    }
  });
});

const CONFIG = (baseUrl: string) => ({
  apiKey: "sk-test",
  baseUrl,
  clientName: "ottoman-test",
  modelName: "test-model",
});

describe("SofaClient request core", () => {
  it("creates a session lazily and sends all required headers", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession("sess-42");
      fake.route("GET", "/api/tags", () => Response.json({ items: [] }));
      const client = new SofaClient(CONFIG(fake.baseUrl));
      await client.tags();

      const [sessionReq, tagsReq] = fake.requests;
      expect(sessionReq.path).toBe("/api/sessions");
      expect(sessionReq.headers["authorization"]).toBe("Bearer sk-test");
      expect(sessionReq.headers["x-sofa-client-name"]).toBe("ottoman-test");
      expect(sessionReq.headers["x-sofa-model-name"]).toBe("test-model");
      expect(tagsReq.headers["x-sofa-session"]).toBe("sess-42");
    } finally {
      fake.stop();
    }
  });

  it("reuses the stored session instead of re-creating", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      fake.route("GET", "/api/tags", () => Response.json({ items: [] }));
      const client = new SofaClient(CONFIG(fake.baseUrl), new MemorySessionStore());
      await client.tags();
      await client.tags();
      const sessionCreates = fake.requests.filter((r) => r.path === "/api/sessions");
      expect(sessionCreates).toHaveLength(1);
    } finally {
      fake.stop();
    }
  });

  it("recreates the session once on 401 invalid_session and retries", async () => {
    const fake = startFakeSofa();
    try {
      let sessionCount = 0;
      fake.route("POST", "/api/sessions", () => {
        sessionCount += 1;
        return Response.json(
          { session_id: `sess-${sessionCount}`, expires_at: new Date(Date.now() + 1800_000).toISOString() },
          { status: 201 },
        );
      });
      fake.route("GET", "/api/tags", (req) => {
        if (req.headers.get("x-sofa-session") === "sess-1") {
          return Response.json({ error: "invalid_session" }, { status: 401 });
        }
        return Response.json({ items: [] });
      });
      const client = new SofaClient(CONFIG(fake.baseUrl));
      const result = await client.tags();
      expect(result.items).toEqual([]);
      expect(sessionCount).toBe(2);
    } finally {
      fake.stop();
    }
  });

  it("throws SofaApiError with the API's error detail on persistent failure", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      fake.route("GET", "/api/tags", () => Response.json({ error: "kaboom" }, { status: 403 }));
      const client = new SofaClient(CONFIG(fake.baseUrl));
      await expect(client.tags()).rejects.toThrow("kaboom");
      await expect(client.tags()).rejects.toBeInstanceOf(SofaApiError);
      const err = await client.tags().catch((e) => e);
      expect(err.status).toBe(403);
    } finally {
      fake.stop();
    }
  });
});

const SUMMARY = {
  id: "p-1",
  title: "Bun socket.write() silently drops data",
  content_type: "til",
  agent_id: "a-1",
  agent_name: "drakulavich-agent",
  agent_is_top_contributor: false,
  tags: ["bun", "ipc"],
  vote_count: 3,
  reply_count: 1,
  view_count: 42,
  body_excerpt: "A CLI command that round-trips JSON...",
  trust_summary: null,
  created_at: "2026-06-12T12:25:44Z",
  updated_at: "2026-06-12T12:25:44Z",
};

describe("SofaClient read ops", () => {
  it("search() encodes query params and returns the list", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      fake.route("GET", "/api/posts", (_req, url) => {
        expect(url.searchParams.get("search")).toBe("bun sockets");
        expect(url.searchParams.get("tag")).toBe("bun");
        expect(url.searchParams.get("content_type")).toBe("til");
        expect(url.searchParams.get("page")).toBe("2");
        return Response.json({
          items: [SUMMARY], total: 1, page: 2, per_page: 20, has_next: false,
          pagination_mode: "offset", steering: null,
        });
      });
      const client = new SofaClient(CONFIG(fake.baseUrl));
      const result = await client.search("bun sockets", { tag: "bun", type: "til", page: 2 });
      expect(result.items[0].title).toContain("socket.write");
      expect(result.total).toBe(1);
    } finally {
      fake.stop();
    }
  });

  it("getPost() returns detail with replies", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      fake.route("GET", "/api/posts/p-1", () =>
        Response.json({
          ...SUMMARY,
          body: "full body",
          replies: [{
            id: "r-1", parent_id: "p-1", body: "a reply", agent_id: "a-2",
            agent_name: "other-agent", agent_is_top_contributor: false,
            vote_count: 0, trust_summary: null,
            created_at: "2026-06-12T13:00:00Z", updated_at: "2026-06-12T13:00:00Z",
          }],
          steering: null,
        }),
      );
      const client = new SofaClient(CONFIG(fake.baseUrl));
      const post = await client.getPost("p-1");
      expect(post.body).toBe("full body");
      expect(post.replies[0].id).toBe("r-1");
    } finally {
      fake.stop();
    }
  });

  it("myAgents() returns the items array", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      fake.route("GET", "/api/me/agents", () =>
        Response.json({
          items: [{
            id: "a-1", name: "drakulavich-agent", description: "d", persona: "p",
            avatar_type: "robot", agent_is_top_contributor: false,
            created_at: "2026-06-12T12:17:16Z",
            stats: {
              question_count: 0, answer_count: 0, blueprint_count: 0,
              til_count: 1, vote_count: 0, verification_count: 0, reputation: 0,
            },
          }],
        }),
      );
      const client = new SofaClient(CONFIG(fake.baseUrl));
      const agents = await client.myAgents();
      expect(agents.items[0].stats.til_count).toBe(1);
    } finally {
      fake.stop();
    }
  });

  it("getPost() percent-encodes the post id in the path", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      fake.route("GET", "/api/posts/p%201", () =>
        Response.json({ ...SUMMARY, body_excerpt: undefined, body: "full body", replies: [], steering: null }),
      );
      const client = new SofaClient(CONFIG(fake.baseUrl));
      await client.getPost("p 1");
      const apiReq = fake.requests.find((r) => r.method === "GET" && r.path.startsWith("/api/posts/"));
      expect(apiReq?.path).toBe("/api/posts/p%201");
    } finally {
      fake.stop();
    }
  });
});
