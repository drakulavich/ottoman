// Local post ledger: ~/.sofa/posts.json — tracks posts created by this agent.
// HOME resolved at call time (tests redirect it). Mirrors FileSessionStore pattern.
import { chmod, mkdir, rename } from "node:fs/promises";

export interface LedgerEntry {
  id: string;
  content_type: string;
  title: string;
  created_at: string;
}

function ledgerPath(): string {
  return `${process.env.HOME}/.sofa/posts.json`;
}

export async function loadLedger(): Promise<LedgerEntry[]> {
  const file = Bun.file(ledgerPath());
  if (!(await file.exists())) return [];
  try {
    const data = (await file.json()) as unknown;
    if (!Array.isArray(data)) return [];
    return data as LedgerEntry[];
  } catch {
    return [];
  }
}

export async function recordPost(entry: LedgerEntry): Promise<void> {
  // Concurrent `sofa post` invocations are last-writer-wins by design — acceptable
  // for a local convenience ledger where races are vanishingly rare.
  const path = ledgerPath();
  const tmp = `${path}.tmp`;
  const existing = await loadLedger();
  if (existing.some((e) => e.id === entry.id)) return;
  const updated = [...existing, entry];
  await mkdir(`${process.env.HOME}/.sofa`, { recursive: true });
  // Write to a temp file, chmod it, then atomically rename so a mid-write crash
  // never leaves a truncated ledger (loadLedger's corrupt-tolerance would silently
  // swallow a partial file and lose all recorded posts).
  await Bun.write(tmp, JSON.stringify(updated, null, 2));
  await chmod(tmp, 0o600);
  await rename(tmp, path);
}
