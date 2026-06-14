import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { runCli } from "../src/cli";
import { setupTmpHome } from "./helpers";

setupTmpHome();

function fakeFetch(pages: Record<string, { status?: number; text: string }>) {
  const calls: string[] = [];
  const fetchText = async (url: string) => {
    calls.push(url);
    const hit = pages[url];
    if (!hit) return { ok: false, status: 404, text: "not found" };
    const status = hit.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: hit.text };
  };
  return { fetchText, calls };
}

describe("guidelines", () => {
  beforeEach(() => {
    process.env.SOFA_BASE_URL = "https://sofa.example";
  });
  afterEach(() => {
    delete process.env.SOFA_BASE_URL;
  });

  it("fetches and prints the markdown for a valid type", async () => {
    const { fetchText, calls } = fakeFetch({
      "https://sofa.example/guidelines/til": { text: "# TIL guide\nbody" },
    });
    const r = await runCli(["guidelines", "til"], { fetchText });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("# TIL guide");
    expect(calls[0]).toBe("https://sofa.example/guidelines/til");
  });

  it("maps aliases (verify -> verification, vote -> voting, coc -> code-of-conduct)", async () => {
    const { fetchText } = fakeFetch({
      "https://sofa.example/guidelines/verification": { text: "VERIF" },
      "https://sofa.example/guidelines/voting": { text: "VOTING" },
      "https://sofa.example/guidelines/code-of-conduct": { text: "COC" },
    });
    expect((await runCli(["guidelines", "verify"], { fetchText })).stdout).toContain("VERIF");
    expect((await runCli(["guidelines", "vote"], { fetchText })).stdout).toContain("VOTING");
    expect((await runCli(["guidelines", "coc"], { fetchText })).stdout).toContain("COC");
  });

  it("skill -> /skill.md and contribute -> /contribute.md", async () => {
    const { fetchText, calls } = fakeFetch({
      "https://sofa.example/skill.md": { text: "SKILL" },
      "https://sofa.example/contribute.md": { text: "CONTRIB" },
    });
    await runCli(["guidelines", "skill"], { fetchText });
    await runCli(["guidelines", "contribute"], { fetchText });
    expect(calls).toContain("https://sofa.example/skill.md");
    expect(calls).toContain("https://sofa.example/contribute.md");
  });

  it("unknown type -> exit 1 usage listing valid types", async () => {
    const { fetchText } = fakeFetch({});
    const r = await runCli(["guidelines", "bogus"], { fetchText });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("usage: sofa guidelines");
    expect(r.stderr).toContain("til");
  });

  it("missing type -> exit 1", async () => {
    const r = await runCli(["guidelines"], { fetchText: fakeFetch({}).fetchText });
    expect(r.exitCode).toBe(1);
  });

  it("--json wraps {type,url,body}", async () => {
    const { fetchText } = fakeFetch({
      "https://sofa.example/guidelines/til": { text: "# TIL" },
    });
    const r = await runCli(["guidelines", "til", "--json"], { fetchText });
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({
      type: "til",
      url: "https://sofa.example/guidelines/til",
      body: "# TIL",
    });
  });

  it("non-2xx -> exit 2 with the URL and status", async () => {
    const { fetchText } = fakeFetch({
      "https://sofa.example/guidelines/til": { status: 500, text: "err" },
    });
    const r = await runCli(["guidelines", "til"], { fetchText });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("500");
  });

  it("works without credentials (public page, no auth needed)", async () => {
    const { fetchText } = fakeFetch({
      "https://sofa.example/guidelines/til": { text: "ok" },
    });
    const r = await runCli(["guidelines", "til"], { fetchText });
    expect(r.exitCode).toBe(0);
  });

  it("trailing slash on base URL is normalized", async () => {
    process.env.SOFA_BASE_URL = "https://sofa.example/";
    const { fetchText, calls } = fakeFetch({
      "https://sofa.example/guidelines/til": { text: "ok" },
    });
    const r = await runCli(["guidelines", "til"], { fetchText });
    expect(r.exitCode).toBe(0);
    expect(calls[0]).toBe("https://sofa.example/guidelines/til");
  });
});
