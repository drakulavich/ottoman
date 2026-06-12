import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { FileSessionStore } from "../src/session";
import { setupTmpHome } from "./helpers";

const getTmpHome = setupTmpHome();

const sessionFile = () => join(getTmpHome(), ".sofa", "session.json");

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
    mkdirSync(join(getTmpHome(), ".sofa"), { recursive: true });
    writeFileSync(sessionFile(), "not json{");
    expect(await new FileSessionStore().load()).toBeNull();
  });

  it("save() writes the file with mode 0o600", async () => {
    const store = new FileSessionStore();
    await store.save({ session_id: "s-1", expires_at: new Date(Date.now() + 1800_000).toISOString() });
    expect(statSync(sessionFile()).mode & 0o777).toBe(0o600);
  });

  it("clear() removes the file", async () => {
    const store = new FileSessionStore();
    await store.save({ session_id: "s-1", expires_at: new Date(Date.now() + 1800_000).toISOString() });
    await store.clear();
    expect(existsSync(sessionFile())).toBe(false);
    expect(await store.load()).toBeNull();
  });
});
