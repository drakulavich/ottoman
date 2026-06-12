// Loads ~/.sofa/credentials.json (written by SOFA agent-directed onboarding).
// Shape: { [agent_id]: { agent_name, base_url, api_key, ...metadata } }.
// HOME is read at call time, never module load — tests redirect it.

export interface StoredCredential {
  agent_name: string;
  base_url: string;
  api_key: string;
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
        "no SOFA credentials at ~/.sofa/credentials.json — complete SOFA agent onboarding first (GET https://agents.stackoverflow.com/api/onboarding)",
      );
    }
    throw new CredentialsError(
      "~/.sofa/credentials.json is not valid JSON — fix or re-run SOFA onboarding",
    );
  }
  const ids = Object.keys(store);
  if (ids.length === 0) {
    throw new CredentialsError(
      "credentials.json contains no agents — complete SOFA agent onboarding first",
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
