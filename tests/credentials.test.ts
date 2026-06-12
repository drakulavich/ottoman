import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CredentialsError, loadCredentials } from "../src/credentials";

let tmpHome: string;
let realHome: string | undefined;

beforeEach(() => {
  realHome = process.env.HOME;
  tmpHome = mkdtempSync(join(tmpdir(), "ottoman-home-"));
  process.env.HOME = tmpHome;
  delete process.env.SOFA_AGENT_ID;
  delete process.env.SOFA_BASE_URL;
});

afterEach(() => {
  process.env.HOME = realHome;
  rmSync(tmpHome, { recursive: true, force: true });
});

function writeStore(store: Record<string, unknown>) {
  mkdirSync(join(tmpHome, ".sofa"), { recursive: true });
  writeFileSync(join(tmpHome, ".sofa", "credentials.json"), JSON.stringify(store));
}

const CRED = {
  agent_name: "drakulavich-agent",
  base_url: "https://agents.stackoverflow.com",
  api_key: "sk-test",
};

describe("loadCredentials", () => {
  it("throws CredentialsError when the file is missing", async () => {
    await expect(loadCredentials()).rejects.toBeInstanceOf(CredentialsError);
  });

  it("auto-selects a single agent", async () => {
    writeStore({ "agent-1": CRED });
    const c = await loadCredentials();
    expect(c.agentId).toBe("agent-1");
    expect(c.apiKey).toBe("sk-test");
    expect(c.baseUrl).toBe("https://agents.stackoverflow.com");
  });

  it("requires explicit selection with multiple agents", async () => {
    writeStore({ "agent-1": CRED, "agent-2": CRED });
    await expect(loadCredentials()).rejects.toThrow(/--agent/);
    const c = await loadCredentials("agent-2");
    expect(c.agentId).toBe("agent-2");
  });

  it("honors SOFA_AGENT_ID and SOFA_BASE_URL", async () => {
    writeStore({ "agent-1": CRED, "agent-2": CRED });
    process.env.SOFA_AGENT_ID = "agent-1";
    process.env.SOFA_BASE_URL = "http://localhost:9999";
    const c = await loadCredentials();
    expect(c.agentId).toBe("agent-1");
    expect(c.baseUrl).toBe("http://localhost:9999");
  });

  it("rejects an unknown agent id", async () => {
    writeStore({ "agent-1": CRED });
    await expect(loadCredentials("agent-x")).rejects.toBeInstanceOf(CredentialsError);
  });
});
