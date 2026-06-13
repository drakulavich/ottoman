// Loads ~/.sofa/credentials.json (written by SOFA agent-directed onboarding).
// Shape: { [agent_id]: { agent_name, base_url, api_key, ...metadata } }.
// HOME is read at call time, never module load — tests redirect it.

import { chmod, mkdir, rename } from "node:fs/promises";

export interface StoredCredential {
  agent_name: string;
  base_url: string;
  api_key: string;
  api_key_prefix?: string;
  api_key_suffix?: string;
}

export interface ResolvedCredentials {
  agentId: string;
  agentName: string;
  baseUrl: string;
  apiKey: string;
}

export class CredentialsError extends Error {}

function credentialsPath(): string {
  return `${process.env.HOME}/.sofa/credentials.json`;
}

export async function loadCredentials(agentId?: string): Promise<ResolvedCredentials> {
  const file = Bun.file(credentialsPath());
  let store: Record<string, StoredCredential>;
  try {
    store = (await file.json()) as Record<string, StoredCredential>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new CredentialsError(
        "no SOFA credentials at ~/.sofa/credentials.json — run `sofa init` to onboard",
      );
    }
    throw new CredentialsError(
      "~/.sofa/credentials.json is not valid JSON — fix or re-run SOFA onboarding",
    );
  }
  const ids = Object.keys(store);
  if (ids.length === 0) {
    throw new CredentialsError(
      "credentials.json contains no agents — run `sofa init` to onboard",
    );
  }
  const id = agentId ?? process.env.SOFA_AGENT_ID ?? (ids.length === 1 ? ids[0] : undefined);
  if (!id) {
    throw new CredentialsError(`multiple agents in credentials.json — pass --agent=<id> (have: ${ids.join(", ")})`);
  }
  const cred = store[id];
  if (!cred) {
    throw new CredentialsError(`agent '${id}' not found in credentials.json (have: ${ids.join(", ")})`);
  }
  return {
    agentId: id,
    agentName: cred.agent_name,
    baseUrl: process.env.SOFA_BASE_URL ?? cred.base_url,
    apiKey: cred.api_key,
  };
}

export async function saveCredential(agentId: string, entry: StoredCredential): Promise<void> {
  const path = credentialsPath();
  let store: Record<string, StoredCredential> = {};
  const file = Bun.file(path);
  if (await file.exists()) {
    try {
      store = (await file.json()) as Record<string, StoredCredential>;
    } catch {
      throw new CredentialsError("~/.sofa/credentials.json is not valid JSON — fix it before `sofa init`");
    }
  }
  if (store[agentId]) {
    throw new CredentialsError(`agent '${agentId}' already in credentials.json — refusing to overwrite`);
  }
  store[agentId] = entry;
  await mkdir(`${process.env.HOME}/.sofa`, { recursive: true });
  const tmp = `${path}.tmp`;
  await Bun.write(tmp, JSON.stringify(store, null, 2));
  await chmod(tmp, 0o600);
  await rename(tmp, path);
}
