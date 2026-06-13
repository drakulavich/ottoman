import { beforeEach, afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runCli, parseArgs } from "../src/cli";
import { startFakeSofa, type FakeSofa } from "./fake-sofa";
import { setupTmpHome } from "./helpers";

const getTmpHome = setupTmpHome();

let fake: FakeSofa;

beforeEach(() => {
  delete process.env.SOFA_AGENT_ID;
  fake = startFakeSofa();
  process.env.SOFA_BASE_URL = fake.baseUrl;
  mkdirSync(join(getTmpHome(), ".sofa"), { recursive: true });
  writeFileSync(
    join(getTmpHome(), ".sofa", "credentials.json"),
    JSON.stringify({ "agent-1": { agent_name: "a", base_url: fake.baseUrl, api_key: "sk-test" } }),
  );
  fake.routeSession();
});

afterEach(() => {
  fake.stop();
  delete process.env.SOFA_BASE_URL;
});

const DETAIL = {
  id: "p-1", title: "Hit title", content_type: "til", agent_id: "a-1",
  agent_name: "x", agent_is_top_contributor: false,
  tags: [{ id: "t1", name: "bun", description: "" }],
  vote_count: 0, reply_count: 0, view_count: 0, trust_summary: null,
  created_at: "2026-06-12T12:00:00Z", updated_at: "2026-06-12T12:00:00Z",
  body: "full body", replies: [], steering: null,
};

// PostCreateResponse shape (POST /api/posts and POST /api/posts/{id}/replies)
const POST_CREATED = {
  id: "p-1", parent_id: null as string | null, content_type: "til" as const, title: "Hit title", body: "full body",
  tags: null as null, reply_count: 0, view_count: 0, vote_count: 0,
  agent_id: "a-1", created_at: "2026-06-12T12:00:00Z", updated_at: "2026-06-12T12:00:00Z",
};

describe("parseArgs", () => {
  it("--flag=value sets string flag", () => {
    const { flags } = parseArgs(["search", "--tag=bun"]);
    expect(flags.tag).toBe("bun");
  });

  it("bare --flag sets boolean true", () => {
    const { flags } = parseArgs(["search", "--json"]);
    expect(flags.json).toBe(true);
  });

  it("repeated flag: last wins (--page=1 --page=2 → '2')", () => {
    const { flags } = parseArgs(["search", "q", "--page=1", "--page=2"]);
    expect(flags.page).toBe("2");
  });

  it("--flag= empty value → empty string", () => {
    const { flags } = parseArgs(["post", "til", "--title="]);
    expect(flags.title).toBe("");
  });

  it("positional/flag interleaving: vote p-1 --json down → positionals ['p-1','down']", () => {
    const { positionals, flags } = parseArgs(["vote", "p-1", "--json", "down"]);
    expect(positionals).toEqual(["p-1", "down"]);
    expect(flags.json).toBe(true);
  });

  it("space-separated --flag value: token without -- is always positional (--tag bun → flags {tag:true}, positionals ['bun'])", () => {
    const { flags, positionals } = parseArgs(["search", "--tag", "bun"]);
    expect(flags.tag).toBe(true);
    expect(positionals).toEqual(["bun"]);
  });
});

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

  it("show appends web URL in text mode", async () => {
    fake.route("GET", "/api/posts/p-1", () => Response.json(DETAIL));
    const res = await runCli(["show", "p-1"]);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain(`${fake.baseUrl}/tils/p-1`);
  });

  it("show does NOT append URL in --json mode", async () => {
    fake.route("GET", "/api/posts/p-1", () => Response.json(DETAIL));
    const res = await runCli(["show", "p-1", "--json"]);
    expect(res.exitCode).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.id).toBe("p-1");
    // stdout must be valid JSON — no extra URL line appended
    expect(res.stdout.trim()).toBe(JSON.stringify(DETAIL, null, 2));
  });

  it("post reads the body from stdin", async () => {
    fake.route("POST", "/api/posts", () => Response.json({ ...POST_CREATED, id: "p-new" }, { status: 201 }));
    const res = await runCli(["post", "til", "--title=T", "--tags=bun,ipc"], {
      readStdin: async () => "body from stdin",
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("p-new");
    const req = fake.requests.find((r) => r.path === "/api/posts");
    expect(req?.body).toEqual({ content_type: "til", title: "T", body: "body from stdin", tags: ["bun", "ipc"] });
  });

  it("post text output includes web URL", async () => {
    fake.route("POST", "/api/posts", () => Response.json({ ...POST_CREATED, id: "p-new" }, { status: 201 }));
    const res = await runCli(["post", "til", "--title=T"], {
      readStdin: async () => "body",
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("created til p-new");
    expect(res.stdout).toContain(`${fake.baseUrl}/tils/p-new`);
  });

  it("post --json output is raw API response (no URL line)", async () => {
    const created = { ...POST_CREATED, id: "p-new" };
    fake.route("POST", "/api/posts", () => Response.json(created, { status: 201 }));
    const res = await runCli(["post", "til", "--title=T", "--json"], {
      readStdin: async () => "body",
    });
    expect(res.exitCode).toBe(0);
    expect(JSON.parse(res.stdout).id).toBe("p-new");
    expect(res.stdout.trim()).toBe(JSON.stringify(created, null, 2));
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
    fake.route("GET", "/api/posts/p-1", () => Response.json(DETAIL));
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
    rmSync(join(getTmpHome(), ".sofa", "credentials.json"));
    const res = await runCli(["whoami"]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("onboarding");
  });

  it("empty --title= exits 1 mentioning --title", async () => {
    const res = await runCli(["post", "til", "--title="], {
      readStdin: async () => "some body",
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("--title");
  });

  it("--page=abc exits 1 mentioning --page", async () => {
    const res = await runCli(["search", "bun", "--page=abc"]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("--page");
  });

  it("--body-file=/nonexistent exits 1", async () => {
    const res = await runCli(["post", "til", "--title=T", "--body-file=/nonexistent/path.md"]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("--body-file");
  });

  it("--type=bogus exits 1 mentioning --type", async () => {
    const res = await runCli(["search", "bun", "--type=bogus"]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("--type");
  });

  it("--tags=bun,, drops empty segments", async () => {
    fake.route("POST", "/api/posts", () => Response.json({ ...POST_CREATED, id: "p-new" }, { status: 201 }));
    const res = await runCli(["post", "til", "--title=T", "--tags=bun,,"], {
      readStdin: async () => "body",
    });
    expect(res.exitCode).toBe(0);
    const req = fake.requests.find((r) => r.path === "/api/posts");
    expect(req?.body).toEqual({ content_type: "til", title: "T", body: "body", tags: ["bun"] });
  });

  it("post records entry to ledger", async () => {
    fake.route("POST", "/api/posts", () => Response.json({ ...POST_CREATED, id: "p-ledger" }, { status: 201 }));
    const res = await runCli(["post", "til", "--title=LedgerTitle"], {
      readStdin: async () => "body",
    });
    expect(res.exitCode).toBe(0);
    const ledgerFile = join(getTmpHome(), ".sofa", "posts.json");
    expect(existsSync(ledgerFile)).toBe(true);
    const ledger = JSON.parse(readFileSync(ledgerFile, "utf8")) as Array<{ id: string }>;
    expect(ledger.some((e) => e.id === "p-ledger")).toBe(true);
  });

  it("mine lists recorded posts", async () => {
    // Set up two posts in the ledger and route getPost for each
    fake.route("GET", "/api/posts/p-m1", () =>
      Response.json({ ...DETAIL, id: "p-m1", title: "Mine Post One", content_type: "til" }),
    );
    fake.route("GET", "/api/posts/p-m2", () =>
      Response.json({ ...DETAIL, id: "p-m2", title: "Mine Post Two", content_type: "question" }),
    );
    // First create two posts to populate the ledger
    fake.route("POST", "/api/posts", () => Response.json({ ...POST_CREATED, id: "p-m1", content_type: "til", title: "Mine Post One" }, { status: 201 }));
    await runCli(["post", "til", "--title=Mine Post One"], { readStdin: async () => "body" });
    // Reroute POST for second post
    fake.route("POST", "/api/posts", () => Response.json({ ...POST_CREATED, id: "p-m2", content_type: "question", title: "Mine Post Two" }, { status: 201 }));
    await runCli(["post", "question", "--title=Mine Post Two"], { readStdin: async () => "body" });

    const res = await runCli(["mine"]);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("Mine Post One");
    expect(res.stdout).toContain("Mine Post Two");
  });

  it("mine shows <deleted> for 404 entries and still lists others", async () => {
    fake.route("GET", "/api/posts/p-alive", () =>
      Response.json({ ...DETAIL, id: "p-alive", title: "Alive Post" }),
    );
    fake.route("GET", "/api/posts/p-dead", () =>
      Response.json({ error: "not found" }, { status: 404 }),
    );
    fake.route("POST", "/api/posts", () => Response.json({ ...POST_CREATED, id: "p-alive", title: "Alive Post" }, { status: 201 }));
    await runCli(["post", "til", "--title=Alive Post"], { readStdin: async () => "body" });
    fake.route("POST", "/api/posts", () => Response.json({ ...POST_CREATED, id: "p-dead", title: "Dead Post" }, { status: 201 }));
    await runCli(["post", "til", "--title=Dead Post"], { readStdin: async () => "body" });

    const res = await runCli(["mine"]);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("Alive Post");
    expect(res.stdout).toContain("<deleted>");
  });

  it("mine empty ledger shows message", async () => {
    const res = await runCli(["mine"]);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("no posts recorded yet");
  });

  it("mine --json returns array of fetched posts", async () => {
    fake.route("GET", "/api/posts/p-j1", () =>
      Response.json({ ...DETAIL, id: "p-j1", title: "JSON Mine" }),
    );
    fake.route("POST", "/api/posts", () => Response.json({ ...POST_CREATED, id: "p-j1", title: "JSON Mine" }, { status: 201 }));
    await runCli(["post", "til", "--title=JSON Mine"], { readStdin: async () => "body" });

    const res = await runCli(["mine", "--json"]);
    expect(res.exitCode).toBe(0);
    const arr = JSON.parse(res.stdout) as Array<{ id: string }>;
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.some((p) => p.id === "p-j1")).toBe(true);
  });
});
