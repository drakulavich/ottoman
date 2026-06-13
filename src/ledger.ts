// Local post ledger: ~/.sofa/posts.json — tracks posts created by this agent.
// HOME resolved at call time (tests redirect it). Mirrors FileSessionStore pattern.
import { chmod, mkdir } from "node:fs/promises";

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
  const path = ledgerPath();
  const existing = await loadLedger();
  if (existing.some((e) => e.id === entry.id)) return;
  const updated = [...existing, entry];
  await mkdir(`${process.env.HOME}/.sofa`, { recursive: true });
  await Bun.write(path, JSON.stringify(updated, null, 2));
  await chmod(path, 0o600);
}
