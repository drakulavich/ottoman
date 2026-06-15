# Self-vote / self-verify guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `sofa vote` and `sofa verify` warn-and-skip (exit 0, no write) when the target post is authored by the acting agent.

**Architecture:** Both writes funnel through `SofaClient.readFirstWrite()`, which already fetches the post for the read-first guard. Capture that post, compare its `agent_id` to the acting agent's id (threaded into `SofaConfig`), and throw a typed `SelfActionError` before the write. The CLI maps `SelfActionError` to exit 0 + a stderr warning.

**Tech Stack:** Bun, TypeScript, `bun test` (with the `tests/fake-sofa.ts` HTTP harness).

Design spec: `docs/2026-06-15-sofa-self-vote-guard-design.md`.

---

### Task 1: Thread the acting `agentId` into the client config

**Files:**
- Modify: `src/client.ts` (the `SofaConfig` interface, ~lines 5-10)
- Modify: `src/cli.ts` (`defaultMakeClient`, ~lines 124-135)
- Modify: `tests/fake-sofa.ts` (`testConfig`, ~lines 4-9)

- [ ] **Step 1: Add `agentId` to `SofaConfig`**

In `src/client.ts`, add the field to the interface:

```ts
export interface SofaConfig {
  apiKey: string;
  baseUrl: string;
  /** The acting agent's id — used to refuse self-votes/self-verifies. */
  agentId: string;
  clientName: string;
  modelName: string;
}
```

- [ ] **Step 2: Populate it in `defaultMakeClient`**

In `src/cli.ts`, `loadCredentials()` already returns `.agentId`. Add it to the config literal:

```ts
async function defaultMakeClient(agentId?: string): Promise<SofaClient> {
  const creds = await loadCredentials(agentId);
  return new SofaClient(
    {
      apiKey: creds.apiKey,
      baseUrl: creds.baseUrl,
      agentId: creds.agentId,
      clientName: "ottoman",
      modelName: process.env.SOFA_MODEL_NAME ?? "unknown",
    },
    new FileSessionStore(),
    { onDebug: makeDebugLogger(process.env.OTTOMAN_DEBUG) },
  );
}
```

- [ ] **Step 3: Populate it in the test harness**

In `tests/fake-sofa.ts`, add `agentId` to `testConfig`. Use `"agent-test"` — deliberately different from the `"a-1"` author id in existing fixtures, so the new guard (Task 2) won't trip existing vote/verify tests:

```ts
export const testConfig = (baseUrl: string) => ({
  apiKey: "sk-test",
  baseUrl,
  agentId: "agent-test",
  clientName: "ottoman-test",
  modelName: "test-model",
});
```

- [ ] **Step 4: Verify nothing broke (types + existing tests)**

Run: `bun run check`
Expected: PASS (type-checks with the new required field; all existing tests still green because no fixture post is authored by `"agent-test"`).

- [ ] **Step 5: Commit**

```bash
git add src/client.ts src/cli.ts tests/fake-sofa.ts
git commit -m "refactor: thread acting agentId into SofaConfig"
```

---

### Task 2: `SelfActionError` + the guard in `readFirstWrite` (client)

**Files:**
- Modify: `src/client.ts` (add `SelfActionError`; modify `readFirstWrite`, `vote`, `verify`, ~lines 336-362)
- Test: `tests/write-ops.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/write-ops.test.ts`, change the import line to include `SelfActionError`:

```ts
import { SelfActionError, SofaApiError, SofaClient } from "../src/client";
```

Then add these two tests inside the `describe("SofaClient write ops", ...)` block:

```ts
  it("vote() refuses a self-vote without issuing the write", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      // Post authored by the acting agent (testConfig.agentId === "agent-test").
      fake.route("GET", "/api/posts/p-1", () => Response.json({ ...DETAIL, agent_id: "agent-test" }));
      let votePosted = false;
      fake.route("POST", "/api/votes", () => {
        votePosted = true;
        return Response.json({}, { status: 201 });
      });
      const client = new SofaClient(CONFIG(fake.baseUrl));
      await expect(client.vote("p-1", 1)).rejects.toThrow(SelfActionError);
      expect(votePosted).toBe(false);
    } finally {
      fake.stop();
    }
  });

  it("verify() refuses a self-verify without issuing the write", async () => {
    const fake = startFakeSofa();
    try {
      fake.routeSession();
      fake.route("GET", "/api/posts/p-1", () => Response.json({ ...DETAIL, agent_id: "agent-test" }));
      let verifyPosted = false;
      fake.route("POST", "/api/verifications", () => {
        verifyPosted = true;
        return Response.json({}, { status: 201 });
      });
      const client = new SofaClient(CONFIG(fake.baseUrl));
      await expect(client.verify("p-1", "worked_as_written", "ok")).rejects.toThrow(SelfActionError);
      expect(verifyPosted).toBe(false);
    } finally {
      fake.stop();
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/write-ops.test.ts`
Expected: FAIL — `SelfActionError` is not exported (import error), and/or the votes/verifications POST is issued so `votePosted`/`verifyPosted` is `true`.

- [ ] **Step 3: Add `SelfActionError` and the guard**

In `src/client.ts`, add the error class next to `SofaApiError` (after its closing brace, ~line 44):

```ts
/** Thrown by vote()/verify() when the target post is authored by the acting
 *  agent. The CLI maps this to a warn-and-skip (exit 0); library consumers can
 *  catch it and decide for themselves. */
export class SelfActionError extends Error {
  constructor(
    public readonly action: "vote" | "verify",
    public readonly postId: string,
  ) {
    super(
      `skipped: refusing to ${action} on your own post (${postId}) — ` +
        `self-${action === "vote" ? "votes" : "verifications"} don't count`,
    );
    this.name = "SelfActionError";
  }
}
```

Replace `readFirstWrite` and the `vote`/`verify` callers (~lines 336-362) with:

```ts
  // non-auth 4xx. Used by vote() and verify().
  private async readFirstWrite<T>(
    postId: string,
    action: "vote" | "verify",
    fn: () => Promise<T>,
  ): Promise<T> {
    const post = await this.getPost(postId);
    // Refuse self-engagement before any write. Compare by id (stable), not name.
    // If agentId is somehow unset, fall through — best-effort, never blocks a
    // legitimate vote.
    if (this.config.agentId && post.agent_id === this.config.agentId) {
      throw new SelfActionError(action, postId);
    }
    try {
      return await fn();
    } catch (err) {
      if (err instanceof SofaApiError && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 403) {
        await new Promise((r) => setTimeout(r, this.options.readFirstRetryDelayMs ?? 1500));
        return fn();
      }
      throw err;
    }
  }

  async vote(postId: string, value: 1 | -1): Promise<Vote> {
    return this.readFirstWrite(postId, "vote", () =>
      this.request<Vote>("POST", "/api/votes", { post_id: postId, value }),
    );
  }

  async verify(postId: string, outcome: VerificationOutcome, feedback: string): Promise<Verification> {
    if (feedback.length > 500) {
      throw new SofaApiError(400, `feedback is ${feedback.length} chars; SOFA caps it at 500`);
    }
    return this.readFirstWrite(postId, "verify", () =>
      this.request<Verification>("POST", "/api/verifications", { post_id: postId, outcome, feedback }),
    );
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/write-ops.test.ts`
Expected: PASS — both new tests pass; the existing vote/verify tests (author `"a-1"` ≠ `"agent-test"`) still pass.

- [ ] **Step 5: Commit**

```bash
git add src/client.ts tests/write-ops.test.ts
git commit -m "feat: refuse self-votes/self-verifies in readFirstWrite"
```

---

### Task 3: CLI warn-and-skip mapping

**Files:**
- Modify: `src/cli.ts` (the `import { ... } from "./client"` line; the top-level `catch` block, ~lines 395-406)
- Test: `tests/cli.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/cli.test.ts`, add this test (the suite's `beforeEach` already writes credentials for agent `"agent-1"` and points `SOFA_BASE_URL` at `fake`, so `defaultMakeClient` resolves `config.agentId === "agent-1"`; `DETAIL` is the existing post-detail fixture in this file):

```ts
  it("vote on your own post warns and skips (exit 0, no write)", async () => {
    fake.route("GET", "/api/posts/p-1", () => Response.json({ ...DETAIL, agent_id: "agent-1" }));
    let votePosted = false;
    fake.route("POST", "/api/votes", () => {
      votePosted = true;
      return Response.json({}, { status: 201 });
    });
    const res = await runCli(["vote", "p-1", "up"]);
    expect(res.exitCode).toBe(0);
    expect(res.stderr).toContain("your own post");
    expect(res.stdout).toBe("");
    expect(votePosted).toBe(false);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/cli.test.ts`
Expected: FAIL — `SelfActionError` currently falls through to the generic catch arm, so `exitCode` is `2` (not `0`) and `stderr` is `String(err)` rather than the skip message.

- [ ] **Step 3: Map `SelfActionError` in the CLI**

In `src/cli.ts`, add `SelfActionError` to the existing import from `./client` (it already imports `SofaApiError`, `SofaClient`, etc.):

```ts
import { SelfActionError, SofaApiError, SofaClient /* …existing… */ } from "./client";
```

Then, in the top-level `catch (err)` block (~line 395), add this branch **before** the `SofaApiError` branch:

```ts
    if (err instanceof SelfActionError) {
      return { exitCode: 0, stdout: "", stderr: err.message };
    }
```

(The existing `UserError`/`CredentialsError`, onboarding, and `SofaApiError` arms stay unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/cli.test.ts`
Expected: PASS — exit 0, stderr contains "your own post", no `/api/votes` request.

- [ ] **Step 5: Full gate + commit**

Run: `bun run check`
Expected: PASS (typecheck + entire test suite).

```bash
git add src/cli.ts tests/cli.test.ts
git commit -m "feat: warn-and-skip self-votes/self-verifies in the CLI (exit 0)"
```

---

## Self-review

- **Spec coverage:** warn-and-skip exit 0 (Task 3); both vote + verify (Tasks 2-3); client-level `readFirstWrite` placement reusing the fetched post (Task 2); compare by `agent_id` (Task 2); `agentId` threaded through config (Task 1); CLI owns the policy (Task 3); falsy-`agentId` fall-through (Task 2 guard condition). Replies untouched (no change to `reply`). All spec sections map to a task.
- **Placeholder scan:** none — every code/step is concrete.
- **Type consistency:** `SelfActionError(action: "vote" | "verify", postId: string)` is defined once (Task 2) and used with that signature in `readFirstWrite`/`vote`/`verify` (Task 2) and matched in the CLI catch (Task 3). `SofaConfig.agentId: string` defined in Task 1 and read as `this.config.agentId` in Task 2. `testConfig.agentId = "agent-test"` (Task 1) is the value the Task 2 tests rely on.
