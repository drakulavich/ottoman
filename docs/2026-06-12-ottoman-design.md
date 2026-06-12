# ottoman — design

**Date:** 2026-06-12
**Status:** Approved
**Repo:** `drakulavich/ottoman` (private)

## Goal

A tiny Bun-native client for the Stack Overflow for Agents (SOFA) REST API
(`https://agents.stackoverflow.com`) that replaces ad-hoc `curl`/`jq`
pipelines. Two consumers of one core from day one: a typed TypeScript
**library** (`SofaClient`) and a **CLI** (`sofa`) for humans and agents in any
shell session. The SOFA skill files can call the CLI instead of assembling raw
HTTP.

Non-goals in v1: the onboarding flow (`sofa init`) — the operator already
holds a key; if the key is missing, the CLI prints the recovery guidance and
points at SOFA's agent-directed onboarding. No MCP server (SOFA's official one
is expected to surface; revisit then). No npm publish (private, `bun link`).

## Decisions (made during brainstorm)

| Question | Decision |
|---|---|
| Consumer | Library + CLI from day one |
| OpenAPI usage | Hand-written client, spec-drift test against live `openapi.json` (no codegen) |
| v1 scope | Knowledge loop only: search, show, post, reply, vote, verify, whoami, status |
| Name | `ottoman` (repo), `sofa` (binary) |
| Distribution | `bun link` |
| Architecture | Layered core + thin CLI (approach A) |
| Dev workflow | OpenSpec, four change proposals |

## Architecture

Zero runtime dependencies; all HTTP via built-in `fetch`. Bun pinned via
`.bun-version` (1.3.13) and `engines.bun`.

| File | Responsibility |
|---|---|
| `src/client.ts` | `SofaClient` — one typed method per endpoint: `search`, `getPost`, `createPost`, `reply`, `vote`, `verify`, `myAgents`, `myVerifications`, `tags`. Config passed explicitly (apiKey, baseUrl, clientName, modelName). Pure: no fs, no env reads. |
| `src/credentials.ts` | Load `~/.sofa/credentials.json` (agent_id-keyed map with `api_key`, `base_url`, metadata). Single agent → auto-select; multiple → require `--agent` / `SOFA_AGENT_ID`, else fail with a list. |
| `src/session.ts` | Session lifecycle. Cache `session_id` + `expires_at` in `~/.sofa/session.json` and reuse across invocations (sessions live ~30 min; one-shot CLI calls must not pay a session-create round trip each time). On `401 invalid_session`: recreate once, retry the original request, fail loud the second time. |
| `src/format.ts` | Human-readable text output per command; `--json` passes the API response through untouched. |
| `src/cli.ts` | Arg parsing → credentials/session resolution → client call → format → exit code. `bin` entry. |
| `index.ts` | Library surface: exports `SofaClient`, `loadCredentials`, and all request/response types. |

## CLI surface

```
sofa search <query> [--tag=x] [--type=til|question|blueprint] [--page=N]
sofa show <post-id>                      # full post + replies
sofa post <til|question|blueprint> --title="..." [--tags=a,b] [--body-file=f | stdin]
sofa reply <post-id> [--body-file=f | stdin]
sofa vote <post-id> <up|down>            # auto-fetches post detail first (read-first guard)
sofa verify <post-id> <worked|changed|failed> --feedback="..."
sofa whoami                              # agent identity + stats
sofa status                              # readiness: key → session → identity (read-only)
```

Global flags: `--json`, `--agent=<id>`. Env overrides: `SOFA_BASE_URL`,
`SOFA_MODEL_NAME` (lands in `X-Sofa-Model-Name`, default `unknown`),
`SOFA_AGENT_ID`. Bodies for `post`/`reply` come from `--body-file` or stdin so
agents pipe markdown without temp files.

Verify outcome mapping: `worked` → `worked_as_written`, `changed` →
`worked_with_changes`, `failed` → `did_not_work`. `--feedback` is required
(API requires it; ≤500 chars).

## SOFA protocol notes

- Every `/api/...` request: `Authorization: Bearer <key>`; all except
  `POST /api/sessions` also need `X-Sofa-Session`.
- Session create needs `X-Sofa-Client-Name` (we send `ottoman`) and
  `X-Sofa-Model-Name`.
- Vote has a read-first guard (server rejects votes on unread posts); `vote`
  silently performs `getPost` first — one extra request, never bites.
- The guard's projection is eventually consistent; on a read-first rejection
  immediately after our auto-fetch, retry once after a short delay.

## Error handling

bowser's exit-code convention:

- `0` — success.
- `1` — user error: bad args, unknown command, missing/ambiguous credentials.
  Message starts `usage:` or names the problem.
- `2` — API/runtime error: non-2xx after the one silent session retry; the
  API's `error`/`detail` field is printed verbatim to stderr.

## Testing

- **Unit + command tests** against a fake SOFA server: `Bun.serve` on an
  ephemeral port with per-test handler injection. Real HTTP, no fetch mocking.
  Credentials/session tests redirect `$HOME` to a tmp dir (call-time
  resolution, not module-time — bowser's `sessionsRoot()` lesson).
- **Spec-drift test** (the contract that replaces codegen): fetch live
  `openapi.json`, assert every path+method ottoman calls exists and every
  response field we read is declared. Gated behind `OTTOMAN_LIVE=1`; runs in
  CI weekly + on demand; never blocks local `bun test`.
- TDD throughout: test first, see it fail, implement minimally, see it pass.

## Development workflow (OpenSpec)

OpenSpec (`@fission-ai/openspec`) initialized in-repo; standing conventions
live in `openspec/project.md`. Four change proposals, implemented in order,
archived on completion:

1. `add-credentials-and-session` — client config, credential loading, session
   cache + retry.
2. `add-read-ops` — search / show / whoami / status + text formatting.
3. `add-write-ops` — post / reply / vote / verify, incl. read-first auto-fetch.
4. `add-cli` — arg parsing, dispatch, exit codes, stdin handling, `bun link`
   smoke test.

## CI

One workflow: `bun test` on push/PR (Ubuntu, `setup-bun` reading
`.bun-version`), plus a weekly-cron + manual job running
`OTTOMAN_LIVE=1 bun test` for spec drift. No release pipeline until the tool
goes public.

## Risks

- **Beta API drift.** SOFA launched 2026-06-10; endpoints may change. The
  drift test is the tripwire; hand-written client keeps the fix surface small.
- **Official MCP server lands.** If/when SOFA ships public MCP, the CLI loses
  some raison d'être for in-session agent use. The library core remains
  useful; revisit scope then.
- **Session cache races.** Two concurrent `sofa` invocations may both refresh
  an expired session. Harmless (the API tolerates multiple live sessions);
  last writer wins on the cache file.
