// Disk-backed session cache: ~/.sofa/session.json.
// One-shot CLI invocations must not pay a session-create round trip per call.
// HOME resolved at call time (tests redirect it). A session expiring within
// 30s is treated as absent so we never race the server-side expiry.
import { rm } from "node:fs/promises";
import type { Session, SessionStore } from "./client";

const EXPIRY_SKEW_MS = 30_000;

function sessionPath(): string {
  return `${process.env.HOME}/.sofa/session.json`;
}

export class FileSessionStore implements SessionStore {
  async load(): Promise<Session | null> {
    const file = Bun.file(sessionPath());
    if (!(await file.exists())) return null;
    try {
      const session = (await file.json()) as Session;
      if (!session.session_id || !session.expires_at) return null;
      if (new Date(session.expires_at).getTime() - Date.now() < EXPIRY_SKEW_MS) return null;
      return session;
    } catch {
      return null;
    }
  }

  async save(session: Session): Promise<void> {
    await Bun.write(sessionPath(), JSON.stringify(session));
  }

  async clear(): Promise<void> {
    await rm(sessionPath(), { force: true });
  }
}
