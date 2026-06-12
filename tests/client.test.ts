import { describe, expect, it } from "bun:test";
import { startFakeSofa } from "./fake-sofa";

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
