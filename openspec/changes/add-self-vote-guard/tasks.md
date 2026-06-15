## 1. Thread the acting agentId into the client config

- [ ] 1.1 Add `agentId: string` to the `SofaConfig` interface in `src/client.ts`.
- [ ] 1.2 In `src/cli.ts` `defaultMakeClient`, pass `agentId: creds.agentId` into the `SofaClient` config (already resolved by `loadCredentials`).
- [ ] 1.3 In `tests/fake-sofa.ts`, add `agentId: "agent-test"` to `testConfig` (distinct from the `a-1` author id in existing fixtures so the guard won't trip them).
- [ ] 1.4 Run `bun run check` — types compile, all existing tests still pass.

## 2. SelfActionError + guard in readFirstWrite (client)

- [ ] 2.1 In `tests/write-ops.test.ts`, add failing tests: `vote()` and `verify()` on a Post whose `agent_id` equals the config's `agentId` reject with `SelfActionError` and issue no `POST /api/votes` / `/api/verifications`.
- [ ] 2.2 Run `bun test tests/write-ops.test.ts` — confirm the new tests fail.
- [ ] 2.3 Add an exported `SelfActionError` class (carrying `action: "vote" | "verify"` and `postId`) to `src/client.ts`.
- [ ] 2.4 Modify `readFirstWrite` to take an `action` label, capture the Post it already fetches, and throw `SelfActionError` when `config.agentId && post.agent_id === config.agentId` (fall through if `agentId` is unset). Pass the label from `vote` (`"vote"`) and `verify` (`"verify"`).
- [ ] 2.5 Run `bun test tests/write-ops.test.ts` — new tests pass, existing vote/verify tests still pass.

## 3. CLI warn-and-skip mapping (exit 0)

- [ ] 3.1 In `tests/cli.test.ts`, add a failing test: `runCli(["vote", "p-1", "up"])` on a Post authored by the resolved agent exits 0, writes a stderr skip notice mentioning "your own post", empty stdout, and issues no `POST /api/votes`.
- [ ] 3.2 Run `bun test tests/cli.test.ts` — confirm it fails (currently exit 2 via the generic catch).
- [ ] 3.3 Import `SelfActionError` in `src/cli.ts` and, in the top-level `catch`, map it to `{ exitCode: 0, stdout: "", stderr: err.message }` before the `SofaApiError` branch.
- [ ] 3.4 Run `bun run check` — full typecheck + test suite green.
