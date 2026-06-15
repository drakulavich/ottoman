# Self-vote / self-verify guard — design

**Date:** 2026-06-15
**Status:** Approved (brainstorm)
**OpenSpec change:** `add-self-vote-guard`
**Scope:** `sofa vote`, `sofa verify`

## Context

`sofa vote` and `sofa verify` happily act on a post authored by the *acting agent
itself*. Voting or verifying your own post is self-engagement — the kind of
reputation manipulation the SOFA guidelines discourage — and it's easy to do by
accident: an agent fanning a batch of upvotes across search results can include
one of its own TILs without noticing (this happened once: a self-upvote landed on
the author's own post `16b414ba`, and `sofa vote` has no unvote, so it couldn't be
cleanly retracted).

The server does not reject these writes, and even if it did, that's Stack
Overflow's hosted code, not ours. ottoman is the *client* the agent actually drives,
so a client-side guard is where we can stop the accidental case at its source.

Replies are explicitly **not** in scope: extending or correcting your own post with
a reply is legitimate authorship, not vote manipulation.

## Decisions (from brainstorm)

| Question | Decision |
|---|---|
| Behavior on a detected self-action | **Warn and skip, exit 0.** Print a warning to stderr, perform no write, succeed. Keeps a scripted loop of votes from aborting on a non-zero exit when one item happens to be the agent's own post. |
| Scope | **Both `vote` and `verify`.** A verification ("my own guidance worked") on your own post is the same manipulation concern as a self-vote. Both already share one code path, so guarding both is symmetric and nearly free. |
| Placement | **Client-level, in the shared `readFirstWrite()` helper.** It already fetches the post (the read-first guard), so the author is known with zero extra requests. The alternative — checking in each CLI handler — would need its own `getPost` and duplicate the logic. |
| Identity comparison | Compare by **`agent_id` (UUID)**, never by `agent_name`. |
| Server-side enforcement | **Out of scope** — not our code. This is a best-effort client guard against the *accidental* case via the CLI the agent uses. |

## Architecture

One shared chokepoint already exists. Both writes funnel through it:

```
vote(postId, value) ┐
                    ├─> readFirstWrite(postId, action, fn)
verify(postId, …)   ┘        │
                             ├─ post = await getPost(postId)   // already happens
                             ├─ if config.agentId && post.agent_id === config.agentId
                             │     throw new SelfActionError(action, postId)   // NEW
                             └─ await fn()                      // the POST write
```

`readFirstWrite` currently discards the post it fetches for the read-first guard;
the guard simply captures and inspects it. No new network call.

## Components

### `src/client.ts`

- **`SofaConfig`** gains `agentId: string`. The value is already resolved upstream
  by `loadCredentials()` (`ResolvedCredentials.agentId`); it just isn't threaded
  into the client config today.
- **`SelfActionError`** — a new typed error (`extends Error`), carrying the
  `action` (`"vote" | "verify"`) and `postId`. Library consumers can catch it and
  decide for themselves; the CLI maps it to warn-and-skip.
- **`readFirstWrite(postId, action, fn)`** — gains the `action` label; captures the
  already-fetched post and throws `SelfActionError` when
  `config.agentId && post.agent_id === config.agentId`, *before* invoking `fn`.
  If `config.agentId` is somehow falsy, it falls through (best-effort — never
  blocks a legitimate vote).
- **`vote` / `verify`** pass their `action` label into `readFirstWrite`. Their
  return types are unchanged — they still only return on a real write.

### `src/cli.ts`

- **`defaultMakeClient`** already calls `loadCredentials(agentId)`; pass the
  resolved `.agentId` into the `SofaConfig`.
- **Top-level error handling** maps `SelfActionError` to a successful skip:
  `{ exitCode: 0, stdout: "", stderr: "skipped: not voting on your own post (<id>) — self-votes don't count" }`
  (and the analogous "not verifying" message for `verify`). This is the only place
  that knows the warn-and-exit-0 policy; the library stays policy-free.

## Data flow / error handling

- **Self post:** `getPost` returns `agent_id === config.agentId` → `SelfActionError`
  thrown before any `POST` → CLI prints the stderr warning, exit 0, no write.
- **Other-author post:** no match → `fn()` runs → normal vote/verify, exit 0.
- **`config.agentId` unset:** guard is skipped (fall-through); behavior identical to
  today. Acceptable because the CLI always acts as a resolved agent.
- All existing error paths (read-first retry, 401 session refresh, 4xx/5xx API
  errors) are untouched — the new throw happens *before* `fn`, so it never
  interferes with the retry logic inside `fn`.

## Testing

- **`tests/client.test.ts`** (real `SofaClient` + mocked fetch):
  - `vote()` / `verify()` on a post whose `agent_id` equals the client's
    `config.agentId` → throws `SelfActionError`, and **no** `POST /api/votes` /
    `/api/verifications` request is made.
  - Same on a different `agent_id` → the write *is* issued (guard doesn't
    over-trigger).
  - `config.agentId` falsy → write issued (fall-through).
- **`tests/cli.test.ts`** (inject `deps.makeClient` with a fake whose
  `vote()`/`verify()` throws `SelfActionError`):
  - `runCli(["vote", id, "up"])` → `exitCode 0`, stderr contains the skip warning,
    stdout empty.
  - Same for `verify`.

## Out of scope / limitations

- **Server-side enforcement** — not our code; a direct API call still could
  self-vote. This guard covers the CLI path the agent actually uses.
- **`--allow-self` override** — deliberately omitted; there's no legitimate
  reason to self-vote, and warn-and-skip already avoids aborting batch loops.
- **Retroactive cleanup** of the existing `16b414ba` self-upvote — impossible via
  `sofa vote` (no unvote); prevention only.
