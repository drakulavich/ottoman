import { beforeEach, afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runCli, parseArgs } from "../src/cli";
import { SofaClient } from "../src/client";
import { startFakeSofa, testConfig, type FakeSofa } from "./fake-sofa";
import { setupTmpHome } from "./helpers";
import { OnboardingClient } from "../src/onboarding";

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

  it("vote on your own Post warns and skips (exit 0, no write)", async () => {
    // Resolved acting agent is "agent-1" (credentials key); make the Post author match.
    fake.route("GET", "/api/posts/p-1", () => Response.json({ ...DETAIL, agent_id: "agent-1" }));
    fake.route("POST", "/api/votes", () => Response.json({ error: "should not be called" }, { status: 500 }));
    const res = await runCli(["vote", "p-1", "up"]);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe("");
    expect(res.stderr).toContain("your own Post");
    expect(fake.requests.some((r) => r.path === "/api/votes")).toBe(false);
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

  it("delete removes a Post and prints confirmation", async () => {
    fake.route("DELETE", "/api/posts/p-1", () => new Response(null, { status: 204 }));
    const res = await runCli(["delete", "p-1"]);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("deleted p-1");
    expect(fake.requests.some((r) => r.method === "DELETE" && r.path === "/api/posts/p-1")).toBe(true);
  });

  it("delete without a post id is a usage error (no network)", async () => {
    const res = await runCli(["delete"]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("usage: sofa delete");
    expect(fake.requests.some((r) => r.method === "DELETE")).toBe(false);
  });

  it("tags lists available tags (text + --json)", async () => {
    fake.route("GET", "/api/tags", () =>
      Response.json({ tags: [{ id: "t1", name: "bun", description: "Bun runtime" }] }),
    );
    const text = await runCli(["tags"]);
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain("bun");
    expect(text.stdout).toContain("Bun runtime");

    const json = await runCli(["tags", "--json"]);
    expect(JSON.parse(json.stdout).tags[0].name).toBe("bun");
  });

  it("verifications lists own verifications for a post (text + --json)", async () => {
    fake.route("GET", "/api/me/verifications", () =>
      Response.json({
        verifications: [
          { id: "vf-1", post_id: "p-1", agent_id: "a-1", outcome: "worked_as_written", feedback: "clean" },
        ],
      }),
    );
    const text = await runCli(["verifications", "p-1"]);
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain("worked_as_written");
    const req = fake.requests.find((r) => r.path.startsWith("/api/me/verifications"));
    expect(req?.path).toContain("post_id=p-1");

    const json = await runCli(["verifications", "p-1", "--json"]);
    expect(JSON.parse(json.stdout).verifications[0].id).toBe("vf-1");
  });

  it("verifications without a post-id exits 1 with usage", async () => {
    const res = await runCli(["verifications"]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("usage: sofa verifications");
  });

  it("leaderboard renders ranked agents (text + --json) and forwards --limit", async () => {
    fake.route("GET", "/api/agents/leaderboard", () =>
      Response.json({
        items: [
          {
            rank: 1, agent_id: "a-1", name: "topbot", description: "", avatar_type: null,
            owner_name: "drakulavich", owner_avatar_url: null, reputation_score: 4200,
            stats: { post_count: 9, reply_count: 3, verification_count: 2 }, last_active_at: null,
          },
        ],
        limit: 5,
      }),
    );
    const text = await runCli(["leaderboard", "--limit=5"]);
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain("#1");
    expect(text.stdout).toContain("topbot");
    expect(text.stdout).toContain("4200");
    const req = fake.requests.find((r) => r.path.startsWith("/api/agents/leaderboard"));
    expect(req?.path).toContain("limit=5");

    const json = await runCli(["leaderboard", "--json"]);
    expect(JSON.parse(json.stdout).items[0].agent_id).toBe("a-1");
  });

  it("leaderboard rejects an out-of-range --limit", async () => {
    const res = await runCli(["leaderboard", "--limit=0"]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("--limit must be an integer between 1 and 100");
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
    expect(res.stderr).toContain("sofa init");
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

  it("ledger failure does not mask successful post (exit 0, warning on stderr)", async () => {
    fake.route("POST", "/api/posts", () => Response.json({ ...POST_CREATED, id: "p-ledger-fail" }, { status: 201 }));
    // Block the ledger write: make posts.json a directory so Bun.write throws.
    // Credentials in .sofa/credentials.json are already written by beforeEach and remain intact.
    mkdirSync(join(getTmpHome(), ".sofa", "posts.json"), { recursive: true });
    const res = await runCli(["post", "til", "--title=T"], {
      readStdin: async () => "body",
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("created");
    expect(res.stdout).toContain("p-ledger-fail");
    expect(res.stderr).toContain("warning");
  });

  it("post with file:// body exits 1 and does not hit server", async () => {
    const res = await runCli(["post", "til", "--title=T"], {
      readStdin: async () => "see file:///etc/passwd for details",
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("file://");
    // No POST request should have been made
    const postReq = fake.requests.find((r) => r.path === "/api/posts" && r.method === "POST");
    expect(postReq).toBeUndefined();
  });

  it("reply with off-network link exits 1 and does not hit server", async () => {
    const res = await runCli(["reply", "p-1"], {
      readStdin: async () => "check https://evil.example.com/x for info",
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("evil.example.com");
  });

  it("post with allowed SO link succeeds", async () => {
    fake.route("POST", "/api/posts", () => Response.json({ ...POST_CREATED, id: "p-ok" }, { status: 201 }));
    const res = await runCli(["post", "til", "--title=T"], {
      readStdin: async () => "see https://stackoverflow.com/q/123 for details",
    });
    expect(res.exitCode).toBe(0);
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

describe("sofa init", () => {
  const home = setupTmpHome();

  function initDeps(fake: ReturnType<typeof startFakeSofa>, opened: string[]) {
    return {
      makeOnboardingClient: (baseUrl: string) => new OnboardingClient({ baseUrl, delayMs: 0 }),
      openUrl: async (url: string) => { opened.push(url); return true; },
      makeClient: async (_agentId?: string) => new SofaClient(testConfig(fake.baseUrl), undefined),
    };
  }

  function routeOnboarding(fake: ReturnType<typeof startFakeSofa>) {
    fake.route("POST", "/api/onboarding/flows", () => Response.json({
      flow_id: "f-1", claim_url: "https://agents.stackoverflow.com/onboarding/claim/f-1",
      claim_code: "ABCD-1234", poll_token: "ptok", poll_after_seconds: 0,
      expires_at: "2099-01-01T00:00:00Z",
    }, { status: 201 }));
    let n = 0;
    fake.route("POST", "/api/onboarding/flows/f-1/status", () => {
      const ready = n++ >= 1;
      return Response.json({ state: ready ? "auth_code_retrieved" : "pending_claim", auth_code: ready ? "AUTHX" : null, auth_code_expires_at: null, expires_at: "2099-01-01T00:00:00Z", poll_after_seconds: 0, recovery: null });
    });
    fake.route("POST", "/api/onboarding/registrations", () => Response.json({
      agent_id: "5c003656", api_key: "sk-secretlive", api_key_prefix: "sk", api_key_suffix: "ve",
    }, { status: 201 }));
    fake.routeSession();
    fake.route("GET", "/api/me/agents", () => Response.json({ items: [{ id: "5c003656", name: "drakulavich-agent", description: "d", persona: "", avatar_type: "robot", agent_is_top_contributor: false, created_at: "2026-06-13T00:00:00Z", stats: { question_count: 0, answer_count: 0, blueprint_count: 0, til_count: 0, vote_count: 0, verification_count: 0, reputation: 7 } }] }));
  }

  it("happy path: flow → poll → register → store key → verify whoami", async () => {
    const fake = startFakeSofa();
    try {
      process.env.SOFA_BASE_URL = fake.baseUrl;
      routeOnboarding(fake);
      const opened: string[] = [];
      const res = await runCli(["init", "--name=drakulavich-agent", "--description=Claude agent"], initDeps(fake, opened));
      expect(res.exitCode).toBe(0);
      expect(opened).toEqual(["https://agents.stackoverflow.com/onboarding/claim/f-1"]);
      expect(res.stdout).toContain("ABCD-1234");
      expect(res.stdout).toContain("Signed in as drakulavich-agent");
      expect(res.stdout).not.toContain("sk-secretlive");
      const store = JSON.parse(readFileSync(join(home(), ".sofa", "credentials.json"), "utf8"));
      expect(store["5c003656"].api_key).toBe("sk-secretlive");
    } finally { fake.stop(); delete process.env.SOFA_BASE_URL; }
  });

  it("--no-open prints the URL and never calls the opener", async () => {
    const fake = startFakeSofa();
    try {
      process.env.SOFA_BASE_URL = fake.baseUrl;
      routeOnboarding(fake);
      const opened: string[] = [];
      const res = await runCli(["init", "--name=x", "--description=d", "--no-open"], initDeps(fake, opened));
      expect(res.exitCode).toBe(0);
      expect(opened).toEqual([]);
      expect(res.stdout).toContain("/onboarding/claim/f-1");
    } finally { fake.stop(); delete process.env.SOFA_BASE_URL; }
  });

  it("missing --name exits 1", async () => {
    const res = await runCli(["init", "--description=d"]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("--name");
  });

  it("already-configured without --add exits 1 with guidance", async () => {
    const fake = startFakeSofa();
    try {
      process.env.SOFA_BASE_URL = fake.baseUrl;
      const { saveCredential } = await import("../src/credentials");
      await saveCredential("existing", { agent_name: "old", base_url: fake.baseUrl, api_key: "sk-old" });
      const res = await runCli(["init", "--name=x", "--description=d"], initDeps(fake, []));
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain("--add");
    } finally { fake.stop(); delete process.env.SOFA_BASE_URL; }
  });

  it("flow denied exits 2 with recovery", async () => {
    const fake = startFakeSofa();
    try {
      process.env.SOFA_BASE_URL = fake.baseUrl;
      fake.route("POST", "/api/onboarding/flows", () => Response.json({ flow_id: "f-1", claim_url: "https://agents.stackoverflow.com/onboarding/claim/f-1", claim_code: "C", poll_token: "p", poll_after_seconds: 0, expires_at: "2099-01-01T00:00:00Z" }, { status: 201 }));
      fake.route("POST", "/api/onboarding/flows/f-1/status", () => Response.json({ state: "denied", auth_code: null, auth_code_expires_at: null, expires_at: "2099-01-01T00:00:00Z", poll_after_seconds: 0, recovery: "ask the human to retry" }));
      const res = await runCli(["init", "--name=x", "--description=d"], initDeps(fake, []));
      expect(res.exitCode).toBe(2);
      expect(res.stderr).toContain("ask the human to retry");
    } finally { fake.stop(); delete process.env.SOFA_BASE_URL; }
  });

  it("--json emits structured data without the raw api_key", async () => {
    const fake = startFakeSofa();
    try {
      process.env.SOFA_BASE_URL = fake.baseUrl;
      routeOnboarding(fake);
      const res = await runCli(["init", "--name=x", "--description=d", "--json"], initDeps(fake, []));
      expect(res.exitCode).toBe(0);
      const parsed = JSON.parse(res.stdout) as Record<string, unknown>;
      expect(parsed.agent_id).toBeDefined();
      expect(parsed.api_key_prefix).toBeDefined();
      expect(parsed.api_key_suffix).toBeDefined();
      expect(parsed.api_key).toBeUndefined();
      expect(res.stdout).not.toContain("sk-secretlive");
    } finally { fake.stop(); delete process.env.SOFA_BASE_URL; }
  });

  it("--add on empty store: registers first agent, no multi-agent note", async () => {
    const fake = startFakeSofa();
    try {
      process.env.SOFA_BASE_URL = fake.baseUrl;
      routeOnboarding(fake);
      const res = await runCli(["init", "--name=x", "--description=d", "--add"], initDeps(fake, []));
      expect(res.exitCode).toBe(0);
      expect(res.stdout).not.toContain("Multiple agents");
    } finally { fake.stop(); delete process.env.SOFA_BASE_URL; }
  });

  it("--add happy path: registers a second agent alongside an existing one", async () => {
    const fake = startFakeSofa();
    try {
      process.env.SOFA_BASE_URL = fake.baseUrl;
      const { saveCredential } = await import("../src/credentials");
      await saveCredential("old-agent", { agent_name: "old", base_url: fake.baseUrl, api_key: "sk-old" });
      routeOnboarding(fake);
      const res = await runCli(["init", "--name=new", "--description=d", "--add"], initDeps(fake, []));
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain("Multiple agents now stored");
      const store = JSON.parse(readFileSync(join(home(), ".sofa", "credentials.json"), "utf8"));
      expect(store["old-agent"]).toBeDefined();
      expect(store["5c003656"]).toBeDefined();
    } finally { fake.stop(); delete process.env.SOFA_BASE_URL; }
  });

  it("model flags are forwarded to the createFlow request body", async () => {
    const fake = startFakeSofa();
    try {
      process.env.SOFA_BASE_URL = fake.baseUrl;
      routeOnboarding(fake);
      const res = await runCli(
        ["init", "--name=x", "--description=d", "--model-name=gpt-5", "--model-provider=openai", "--model-selection-mode=fixed"],
        initDeps(fake, []),
      );
      expect(res.exitCode).toBe(0);
      const flowReq = fake.requests.find((r) => r.path === "/api/onboarding/flows")?.body as Record<string, unknown> | undefined;
      expect(flowReq?.model_name).toBe("gpt-5");
      expect(flowReq?.model_provider).toBe("openai");
      expect(flowReq?.model_selection_mode).toBe("fixed");
    } finally { fake.stop(); delete process.env.SOFA_BASE_URL; }
  });

  it("corrupt credentials.json exits 1 before starting the flow", async () => {
    const fake = startFakeSofa();
    try {
      process.env.SOFA_BASE_URL = fake.baseUrl;
      const credDir = join(home(), ".sofa");
      mkdirSync(credDir, { recursive: true });
      writeFileSync(join(credDir, "credentials.json"), "not valid json{{{");
      const res = await runCli(["init", "--name=x", "--description=d"], initDeps(fake, []));
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain("not valid JSON");
      // No flow should have been started
      expect(fake.requests.find((r) => r.path === "/api/onboarding/flows")).toBeUndefined();
    } finally { fake.stop(); delete process.env.SOFA_BASE_URL; }
  });
});
