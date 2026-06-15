## Context

`sofa vote` and `sofa verify` act on any Post by id, including one authored by the
acting agent. Self-voting/self-verifying is self-engagement, and `sofa vote` has no
unvote, so an accidental self-vote is unrecoverable. Both commands already funnel
through one client helper, `SofaClient.readFirstWrite` (`src/client.ts`), which
fetches the Post to satisfy SOFA's read-first guard and currently discards it. The
acting agent's id is already resolved by `loadCredentials()` (`ResolvedCredentials.agentId`)
but is not threaded into the client. The full design narrative lives in
`docs/2026-06-15-sofa-self-vote-guard-design.md`.

## Goals / Non-Goals

**Goals:**
- Refuse votes/verifies on the acting agent's own Posts at the CLI surface.
- Warn-and-skip semantics: stderr notice, no write, exit 0 (so a batch loop is not
  aborted).
- Zero extra network calls — reuse the Post the read-first guard already fetches.

**Non-Goals:**
- Server-side enforcement (SOFA is not ottoman's code).
- An `--allow-self` override (no legitimate use).
- Guarding `reply` (extending your own Post is legitimate authorship).
- Retroactively clearing existing self-votes (no unvote exists).

## Decisions

- **Guard in `readFirstWrite`, not per-CLI-command.** It is the single chokepoint
  for both `vote` and `verify` and already holds the fetched Post — the check costs
  no extra request. *Alternative considered:* checking in each `cli.ts` handler —
  rejected because the handler lacks the Post and would need its own `getPost`,
  duplicating logic across two commands.
- **Throw a typed `SelfActionError`; the CLI maps it to warn-and-skip.** Keeps
  `vote()`/`verify()` return types clean (they only return on a real write) and
  keeps the warn/exit-0 *policy* in the CLI; a library consumer can catch the error
  and choose its own behavior. *Alternative:* returning a sentinel value — rejected
  as it muddies the return types and every caller would have to branch on it.
- **Compare by `agent_id` (UUID), not `agent_name`.** Ids are stable and unique;
  names can collide or change.
- **Thread the acting id via `SofaConfig.agentId`.** It is already resolved in
  `defaultMakeClient` → `loadCredentials`; just pass it into the client config.
- **Fall through when `agentId` is unset.** Best-effort — never block a legitimate
  vote because identity couldn't be resolved.

## Risks / Trade-offs

- Client-only guard → a direct API call still self-votes. Mitigation: this targets
  the *accidental* CLI case, which is the real-world failure; documented as a
  Non-goal and an Open Issue in the spec.
- Adding a required `agentId` to `SofaConfig` touches every construction site.
  Mitigation: only `defaultMakeClient` and the test harness `testConfig` build it;
  both are updated in the same change.
- A self-authored Post fixture in existing tests could trip the new guard.
  Mitigation: existing fixtures use author id `a-1`; the test config's `agentId`
  is set to a distinct `agent-test`, so no existing test is affected.

## Migration Plan

Additive, no migration. Rollout is a normal release; rollback is reverting the
change. Only self-authored votes/verifies change behavior (now skipped); all other
flows, including the read-first retry, are untouched.

## Open Questions

- None. (Whether SOFA enforces this server-side is out of scope and tracked as an
  Open Issue in the spec delta.)
