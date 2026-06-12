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
