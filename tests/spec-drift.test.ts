// Contract with SOFA's published OpenAPI spec — the check that replaces codegen.
// Gated: only runs with OTTOMAN_LIVE=1 (CI weekly cron + manual). Network required.
import { describe, expect, it } from "bun:test";

const LIVE = process.env.OTTOMAN_LIVE === "1";
const BASE = process.env.SOFA_BASE_URL ?? "https://agents.stackoverflow.com";

// Every path+method ottoman calls, and the response schema fields it reads.
const CALLS: Array<{ method: string; path: string; schema?: string; reads?: string[] }> = [
  { method: "post", path: "/api/sessions", schema: "SessionCreateResponse", reads: ["session_id", "expires_at"] },
  { method: "delete", path: "/api/sessions/{session_id}" },
  { method: "get", path: "/api/posts", schema: "PostListResponse", reads: ["items", "total", "page", "per_page", "has_next"] },
  { method: "get", path: "/api/posts/{post_id}", schema: "PostDetailResponse", reads: ["id", "title", "content_type", "body", "replies", "tags", "vote_count", "agent_name"] },
  { method: "post", path: "/api/posts", schema: "PostCreateResponse", reads: ["id", "content_type", "parent_id"] },
  { method: "post", path: "/api/posts/{post_id}/replies", schema: "PostCreateResponse", reads: ["id", "parent_id"] },
  { method: "delete", path: "/api/posts/{post_id}" }, // deletePost (sofa delete) — 204 No Content, no body fields to read.
  { method: "post", path: "/api/votes", schema: "VoteResponse", reads: ["post_id", "value"] },
  { method: "post", path: "/api/verifications", schema: "VerificationResponse", reads: ["post_id", "outcome"] },
  { method: "get", path: "/api/me/agents", schema: "AgentListResponse", reads: ["items"] },
  { method: "get", path: "/api/me/verifications", schema: "VerificationListResponse", reads: ["verifications"] },
  { method: "get", path: "/api/tags", schema: "TagListResponse", reads: ["tags"] },
  { method: "get", path: "/api/agents/leaderboard", schema: "AgentLeaderboardResponse", reads: ["items", "limit"] },
  { method: "post", path: "/api/onboarding/flows", schema: "OnboardingFlowCreateResponse", reads: ["flow_id", "claim_url", "claim_code", "poll_token", "expires_at"] },
  { method: "post", path: "/api/onboarding/flows/{flow_id}/status", schema: "OnboardingStatusResponse", reads: ["state", "auth_code", "expires_at"] },
  { method: "post", path: "/api/onboarding/registrations", schema: "OnboardingRegistrationResponse", reads: ["agent_id", "api_key", "api_key_prefix", "api_key_suffix"] },
];

describe.skipIf(!LIVE)("spec drift vs live openapi.json", () => {
  it("every endpoint ottoman calls still exists with the fields it reads", async () => {
    const res = await fetch(`${BASE}/openapi.json`);
    expect(res.status).toBe(200);
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
    };
    for (const call of CALLS) {
      const pathItem = spec.paths[call.path];
      expect(pathItem, `path gone from spec: ${call.path}`).toBeDefined();
      expect(pathItem[call.method], `method gone: ${call.method.toUpperCase()} ${call.path}`).toBeDefined();
      if (call.schema && call.reads) {
        const schema = spec.components.schemas[call.schema];
        expect(schema, `schema gone/renamed in spec: ${call.schema}`).toBeDefined();
        const props = schema?.properties ?? {};
        for (const field of call.reads) {
          expect(props[field], `${call.schema}.${field} gone from spec`).toBeDefined();
        }
      }
    }
  });
});
