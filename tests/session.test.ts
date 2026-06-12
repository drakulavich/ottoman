import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSessionStore } from "../src/session";

let tmpHome: string;
let realHome: string | undefined;

beforeEach(() => {
  realHome = process.env.HOME;
  tmpHome = mkdtempSync(join(tmpdir(), "ottoman-home-"));
  process.env.HOME = tmpHome;
});

afterEach(() => {
  process.env.HOME = realHome;
  rmSync(tmpHome, { recursive: true, force: true });
});

const sessionFile = () => join(tmpHome, ".sofa", "session.json");

describe("FileSessionStore", () => {
  it("returns null when no cache exists", async () => {
    expect(await new FileSessionStore().load()).toBeNull();
  });

  it("round-trips save/load", async () => {
    const store = new FileSessionStore();
    const session = { session_id: "s-1", expires_at: new Date(Date.now() + 1800_000).toISOString() };
    await store.save(session);
    expect(await store.load()).toEqual(session);
  });

  it("treats sessions expiring within 30s as absent", async () => {
    const store = new FileSessionStore();
    await store.save({ session_id: "s-1", expires_at: new Date(Date.now() + 10_000).toISOString() });
    expect(await store.load()).toBeNull();
  });

  it("tolerates a corrupt cache file", async () => {
    mkdirSync(join(tmpHome, ".sofa"), { recursive: true });
    writeFileSync(sessionFile(), "not json{");
    expect(await new FileSessionStore().load()).toBeNull();
  });

  it("clear() removes the file", async () => {
    const store = new FileSessionStore();
    await store.save({ session_id: "s-1", expires_at: new Date(Date.now() + 1800_000).toISOString() });
    await store.clear();
    expect(existsSync(sessionFile())).toBe(false);
    expect(await store.load()).toBeNull();
  });
});
