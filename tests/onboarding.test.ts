import { describe, expect, it } from "bun:test";
import { startFakeSofa } from "./fake-sofa";
import { OnboardingClient, OnboardingError } from "../src/onboarding";

const FLOW = {
  flow_id: "f-1", claim_url: "https://agents.stackoverflow.com/onboarding/claim/f-1",
  claim_code: "ABCD-1234", poll_token: "ptok", poll_after_seconds: 1,
  expires_at: "2099-01-01T00:00:00Z", next_step: null, storage_guidance: [],
};

describe("OnboardingClient", () => {
  it("createFlow posts client metadata and returns the flow", async () => {
    const fake = startFakeSofa();
    try {
      fake.route("POST", "/api/onboarding/flows", () => Response.json(FLOW, { status: 201 }));
      const oc = new OnboardingClient({ baseUrl: fake.baseUrl });
      const flow = await oc.createFlow({ client_name: "ottoman", client_version: "0.2.0" });
      expect(flow.claim_code).toBe("ABCD-1234");
      const req = fake.requests.find((r) => r.path === "/api/onboarding/flows");
      expect(req?.body).toMatchObject({ client_name: "ottoman", client_version: "0.2.0" });
      expect(req?.headers["authorization"]).toBeUndefined();
    } finally { fake.stop(); }
  });

  it("awaitAuthCode polls until auth_code is present, advancing state", async () => {
    const fake = startFakeSofa();
    try {
      const states = ["pending_claim", "claim_viewed", "auth_code_retrieved"];
      let n = 0;
      fake.route("POST", "/api/onboarding/flows/f-1/status", () => {
        const state = states[Math.min(n, states.length - 1)]; n += 1;
        const auth_code = state === "auth_code_retrieved" ? "AUTHX" : null;
        return Response.json({ state, auth_code, auth_code_expires_at: null, expires_at: FLOW.expires_at, poll_after_seconds: 0, recovery: null, next_step: null });
      });
      const oc = new OnboardingClient({ baseUrl: fake.baseUrl, delayMs: 0 });
      const code = await oc.awaitAuthCode(FLOW);
      expect(code).toBe("AUTHX");
      expect(n).toBeGreaterThanOrEqual(3);
    } finally { fake.stop(); }
  });

  it("awaitAuthCode throws OnboardingError with recovery on a denied/expired state", async () => {
    const fake = startFakeSofa();
    try {
      fake.route("POST", "/api/onboarding/flows/f-1/status", () =>
        Response.json({ state: "expired", auth_code: null, auth_code_expires_at: null, expires_at: FLOW.expires_at, poll_after_seconds: 0, recovery: "start a new flow", next_step: null }));
      const oc = new OnboardingClient({ baseUrl: fake.baseUrl, delayMs: 0 });
      await expect(oc.awaitAuthCode(FLOW)).rejects.toBeInstanceOf(OnboardingError);
      await expect(oc.awaitAuthCode(FLOW)).rejects.toThrow(/start a new flow/);
    } finally { fake.stop(); }
  });

  it("awaitAuthCode gives up when the flow deadline passes", async () => {
    const fake = startFakeSofa();
    try {
      fake.route("POST", "/api/onboarding/flows/f-1/status", () =>
        Response.json({ state: "pending_claim", auth_code: null, auth_code_expires_at: null, expires_at: "2000-01-01T00:00:00Z", poll_after_seconds: 0, recovery: null, next_step: null }));
      let t = 0;
      const oc = new OnboardingClient({ baseUrl: fake.baseUrl, delayMs: 0, now: () => (t += 1000) });
      await expect(oc.awaitAuthCode({ ...FLOW, expires_at: "2000-01-01T00:00:00Z" })).rejects.toBeInstanceOf(OnboardingError);
    } finally { fake.stop(); }
  });

  it("register posts the human-provided values and returns the key", async () => {
    const fake = startFakeSofa();
    try {
      fake.route("POST", "/api/onboarding/registrations", () =>
        Response.json({ agent_id: "a-1", api_key: "sk-live", api_key_prefix: "sk", api_key_suffix: "ve", storage_guidance: [], next_step: null }, { status: 201 }));
      const oc = new OnboardingClient({ baseUrl: fake.baseUrl });
      const reg = await oc.register("AUTHX", { agent_name: "x", description: "d", persona: "" });
      expect(reg.agent_id).toBe("a-1");
      const req = fake.requests.find((r) => r.path === "/api/onboarding/registrations");
      expect(req?.body).toEqual({ auth_code: "AUTHX", agent_name: "x", description: "d", persona: "" });
    } finally { fake.stop(); }
  });
});
