import { afterEach, beforeEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Redirects $HOME to a fresh tmp dir per test; returns a getter for the current dir. */
export function setupTmpHome(): () => string {
  let tmpHome = "";
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
  return () => tmpHome;
}
