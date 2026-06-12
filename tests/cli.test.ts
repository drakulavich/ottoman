import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../src/cli";
import { startFakeSofa, type FakeSofa } from "./fake-sofa";

let tmpHome: string;
let realHome: string | undefined;
let fake: FakeSofa;

beforeEach(() => {
  realHome = process.env.HOME;
  tmpHome = mkdtempSync(join(tmpdir(), "ottoman-home-"));
  process.env.HOME = tmpHome;
  delete process.env.SOFA_AGENT_ID;
  fake = startFakeSofa();
  process.env.SOFA_BASE_URL = fake.baseUrl;
  mkdirSync(join(tmpHome, ".sofa"), { recursive: true });
  writeFileSync(
    join(tmpHome, ".sofa", "credentials.json"),
    JSON.stringify({ "agent-1": { agent_name: "a", base_url: fake.baseUrl, api_key: "sk-test" } }),
  );
  fake.routeSession();
});

afterEach(() => {
  fake.stop();
  process.env.HOME = realHome;
  delete process.env.SOFA_BASE_URL;
  rmSync(tmpHome, { recursive: true, force: true });
});

const DETAIL = {
  id: "p-1", title: "Hit title", content_type: "til", agent_id: "a-1",
  agent_name: "x", agent_is_top_contributor: false, tags: ["bun"],
  vote_count: 0, reply_count: 0, view_count: 0, trust_summary: null,
  created_at: "2026-06-12T12:00:00Z", updated_at: "2026-06-12T12:00:00Z",
  body: "full body", replies: [], steering: null,
};

describe("sofa CLI", () => {
  it("search renders text by default and JSON with --json", async () => {
    fake.route("GET", "/api/posts", () =>
      Response.json({
        items: [{ ...DETAIL, body_excerpt: "e" }], total: 1, page: 1, per_page: 20,
        has_next: false, pagination_mode: "offset", steering: null,
      }),
    );
    const text = await runCli(["search", "bun"]);
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain("Hit title");

    const json = await runCli(["search", "bun", "--json"]);
    expect(JSON.parse(json.stdout).items[0].id).toBe("p-1");
  });

  it("show fetches a post", async () => {
    fake.route("GET", "/api/posts/p-1", () => Response.json(DETAIL));
    const res = await runCli(["show", "p-1"]);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("full body");
  });

  it("post reads the body from stdin", async () => {
    fake.route("POST", "/api/posts", () => Response.json({ ...DETAIL, id: "p-new" }, { status: 201 }));
    const res = await runCli(["post", "til", "--title=T", "--tags=bun,ipc"], {
      readStdin: async () => "body from stdin",
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("p-new");
    const req = fake.requests.find((r) => r.path === "/api/posts");
    expect(req?.body).toEqual({ content_type: "til", title: "T", body: "body from stdin", tags: ["bun", "ipc"] });
  });

  it("vote maps up/down and auto-reads first", async () => {
    fake.route("GET", "/api/posts/p-1", () => Response.json(DETAIL));
    fake.route("POST", "/api/votes", () =>
      Response.json({ id: "v-1", post_id: "p-1", agent_id: "a-1", value: -1, created_at: "2026-06-12T12:00:00Z", steering: null }, { status: 201 }),
    );
    const res = await runCli(["vote", "p-1", "down"]);
    expect(res.exitCode).toBe(0);
    const voteReq = fake.requests.find((r) => r.path === "/api/votes");
    expect(voteReq?.body).toEqual({ post_id: "p-1", value: -1 });
  });

  it("verify maps friendly outcomes and requires --feedback", async () => {
    fake.route("POST", "/api/verifications", () =>
      Response.json({ id: "vf-1", post_id: "p-1", agent_id: "a-1", outcome: "did_not_work", feedback: "f", created_at: "2026-06-12T12:00:00Z", steering: null }, { status: 201 }),
    );
    const missing = await runCli(["verify", "p-1", "failed"]);
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain("--feedback");

    const ok = await runCli(["verify", "p-1", "failed", "--feedback=f"]);
    expect(ok.exitCode).toBe(0);
    const req = fake.requests.find((r) => r.path === "/api/verifications");
    expect(req?.body).toEqual({ post_id: "p-1", outcome: "did_not_work", feedback: "f" });
  });

  it("unknown command exits 1 with usage", async () => {
    const res = await runCli(["frobnicate"]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("usage:");
  });

  it("API failure exits 2 with the server detail", async () => {
    fake.route("GET", "/api/posts/p-1", () => Response.json({ error: "kaboom" }, { status: 500 }));
    const res = await runCli(["show", "p-1"]);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain("kaboom");
  });

  it("missing credentials exits 1", async () => {
    rmSync(join(tmpHome, ".sofa", "credentials.json"));
    const res = await runCli(["whoami"]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("onboarding");
  });
});
