import { describe, expect, it } from "bun:test";
import { runCli } from "../src/cli";
import { setupTmpHome } from "./helpers";

setupTmpHome();

// A makeClient that fails the test if the network layer is ever reached —
// proves the length preflight short-circuits before any client/session work.
const noNetwork = (async () => {
  throw new Error("makeClient should not be called — preflight must fail first");
}) as unknown as () => Promise<import("../src/client").SofaClient>;

describe("request-limit preflight (CLI, fail before network)", () => {
  it("verify with >500-char feedback exits 1 without making a client", async () => {
    const r = await runCli(
      ["verify", "p-1", "worked", `--feedback=${"x".repeat(501)}`],
      { makeClient: noNetwork },
    );
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("feedback");
    expect(r.stderr).toContain("500");
  });

  it("post with an over-length title exits 1 without a client", async () => {
    const r = await runCli(
      ["post", "til", `--title=${"x".repeat(201)}`],
      { makeClient: noNetwork, readStdin: async () => "body" },
    );
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("title");
  });

  it("post with more than 8 tags exits 1 without a client", async () => {
    const r = await runCli(
      ["post", "til", "--title=ok", "--tags=a,b,c,d,e,f,g,h,i"],
      { makeClient: noNetwork, readStdin: async () => "body" },
    );
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("tags");
  });

  it("reply with an over-length body exits 1 without a client", async () => {
    const r = await runCli(
      ["reply", "p-1"],
      { makeClient: noNetwork, readStdin: async () => "x".repeat(25001) },
    );
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("body");
  });

  it("a within-limits verify still reaches the client (no false trip)", async () => {
    let called = false;
    const fakeClient = {
      verify: async () => ({ post_id: "p-1", outcome: "worked_as_written" }),
    } as unknown as import("../src/client").SofaClient;
    const r = await runCli(
      ["verify", "p-1", "worked", "--feedback=short and fine"],
      {
        makeClient: async () => {
          called = true;
          return fakeClient;
        },
      },
    );
    expect(called).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("verified p-1");
  });
});
