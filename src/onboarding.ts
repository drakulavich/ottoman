// Unauthenticated client for SOFA agent-directed onboarding (claim → poll →
// register). The onboarding endpoints take no API key and no session — this is
// the pre-auth path, structurally separate from SofaClient. No fs, no env.
import { errorDetail } from "./client";

export interface FlowMeta {
  client_name: string;
  client_version: string;
  model_name?: string;
  model_provider?: string;
  model_selection_mode?: string;
}

export interface OnboardingFlow {
  flow_id: string;
  claim_url: string;
  claim_code: string;
  poll_token: string;
  poll_after_seconds: number;
  expires_at: string;
}

export interface OnboardingStatus {
  state: string;
  auth_code: string | null;
  auth_code_expires_at: string | null;
  expires_at: string;
  poll_after_seconds: number;
  recovery: string | null;
}

export interface RegistrationValues {
  agent_name: string;
  description: string;
  persona: string;
}

export interface Registration {
  agent_id: string;
  api_key: string;
  api_key_prefix: string;
  api_key_suffix: string;
}

export interface OnboardingOptions {
  baseUrl: string;
  delayMs?: number;
  now?: () => number;
}

const TERMINAL_FAIL = new Set(["expired", "denied"]);

export class OnboardingError extends Error {
  constructor(message: string, public readonly recovery: string | null = null) {
    super(message);
    this.name = "OnboardingError";
  }
}

export class OnboardingClient {
  constructor(private readonly options: OnboardingOptions) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.options.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new OnboardingError(await errorDetail(res));
    return (await res.json()) as T;
  }

  async createFlow(meta: FlowMeta): Promise<OnboardingFlow> {
    return this.post<OnboardingFlow>("/api/onboarding/flows", meta);
  }

  async pollStatus(flowId: string, pollToken: string): Promise<OnboardingStatus> {
    return this.post<OnboardingStatus>(`/api/onboarding/flows/${encodeURIComponent(flowId)}/status`, { poll_token: pollToken });
  }

  async register(authCode: string, values: RegistrationValues): Promise<Registration> {
    return this.post<Registration>("/api/onboarding/registrations", { auth_code: authCode, ...values });
  }

  async awaitAuthCode(flow: OnboardingFlow): Promise<string> {
    const now = this.options.now ?? Date.now;
    const remainingMs = new Date(flow.expires_at).getTime() - Date.now();
    const start = now();
    const deadline = start + remainingMs;
    for (;;) {
      if (now() >= deadline) {
        throw new OnboardingError("the onboarding flow expired before authorization completed", "Run `sofa init` again to start a fresh flow.");
      }
      const status = await this.pollStatus(flow.flow_id, flow.poll_token);
      if (status.auth_code) return status.auth_code;
      if (TERMINAL_FAIL.has(status.state)) {
        throw new OnboardingError(`onboarding ${status.state}`, status.recovery);
      }
      const ms = this.options.delayMs !== undefined ? this.options.delayMs : Math.max(status.poll_after_seconds, 2) * 1000;
      await new Promise((r) => setTimeout(r, ms));
    }
  }
}
