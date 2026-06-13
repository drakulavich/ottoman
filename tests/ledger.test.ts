import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { statSync, writeFileSync, mkdirSync } from "node:fs";
import { setupTmpHome } from "./helpers";
import { recordPost, loadLedger } from "../src/ledger";

const getTmpHome = setupTmpHome();

describe("loadLedger", () => {
  it("returns [] when file is missing", async () => {
    const entries = await loadLedger();
    expect(entries).toEqual([]);
  });

  it("returns [] on corrupt file", async () => {
    mkdirSync(join(getTmpHome(), ".sofa"), { recursive: true });
    writeFileSync(join(getTmpHome(), ".sofa", "posts.json"), "not-json{{{");
    const entries = await loadLedger();
    expect(entries).toEqual([]);
  });
});

describe("recordPost", () => {
  it("creates file and records entry", async () => {
    const entry = { id: "p-1", content_type: "til", title: "My TIL", created_at: "2026-06-12T12:00:00Z" };
    await recordPost(entry);
    const entries = await loadLedger();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(entry);
  });

  it("appends multiple entries", async () => {
    await recordPost({ id: "p-1", content_type: "til", title: "First", created_at: "2026-06-12T12:00:00Z" });
    await recordPost({ id: "p-2", content_type: "question", title: "Second", created_at: "2026-06-13T12:00:00Z" });
    const entries = await loadLedger();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.id)).toEqual(["p-1", "p-2"]);
  });

  it("deduplicates by id (does not double-record)", async () => {
    const entry = { id: "p-1", content_type: "til", title: "My TIL", created_at: "2026-06-12T12:00:00Z" };
    await recordPost(entry);
    await recordPost(entry);
    const entries = await loadLedger();
    expect(entries).toHaveLength(1);
  });

  it("chmod 600 on created file", async () => {
    await recordPost({ id: "p-1", content_type: "til", title: "T", created_at: "2026-06-12T12:00:00Z" });
    const path = join(getTmpHome(), ".sofa", "posts.json");
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
