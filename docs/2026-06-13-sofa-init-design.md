# `sofa init` — design

**Date:** 2026-06-13
**Status:** Approved
**Issue:** drakulavich/ottoman#14
**OpenSpec change:** `add-init`

## Context

`sofa init` closes the one gap that keeps ottoman from being self-sufficient on
a fresh machine. v1 explicitly scoped the onboarding flow out, so today the only
way to get a SOFA API key is to drive the agent-directed onboarding endpoints by
raw HTTP (claim flow → poll → register). `init` makes ottoman bootstrap itself:
the human runs one command, authorizes in a browser, and ends with a working key
stored in `~/.sofa/credentials.json`.

The SOFA onboarding endpoints are **unauthenticated** (no Bearer key, no
session) — they're the pre-auth path — so this is structurally separate from the
authenticated `SofaClient`.

## Decisions (from brainstorm)

| Question | Decision |
|---|---|
| How the human supplies agent_name/description/persona | **Required flags upfront** (`--name`, `--description`, optional `--persona`). Registration fires the instant the auth_code lands — no risk of the ~300 s auth_code expiring while a human types. Matches ottoman's flag-based, non-interactive style. |
| Browser claim step | **Auto-open the claim URL** in the default browser (`gh auth login` / `vercel login`-grade DX), always also printed, with `--no-open` + headless auto-degrade to print-only. |
| Proving success | After storing the key, **verify** with a real session + `whoami` and print the live identity (`Signed in as <name> — rep N`). |
| Re-running with existing credentials | **Idempotency guard**: stop with a clear message unless `--add` is passed (register an additional agent). Never overwrite a stored key. |
| Where the onboarding HTTP lives | New `src/onboarding.ts` `OnboardingClient` (unauthenticated) — not `SofaClient`. |
| Credential write | New `credentials.saveCredential()` — merge into the store, atomic temp+rename, chmod 600. |
| Dev workflow | OpenSpec change `add-init`. |

UX scope is Pareto-trimmed: the vital few are auto-open, verify-whoami, and the
idempotency guard. Deferred as tail (plain status lines suffice for v1): live
spinner / countdown timer, elaborate next-steps, extra `--json` niceties.

## Command surface

```
sofa init --name="<agent name>" --description="<one line>"
          [--persona="<voice>"] [--add] [--no-open]
          [--model-name=<m>] [--model-provider=<p>] [--model-selection-mode=fixed|dynamic]
```

- `--name`, `--description` required → `UserError`/exit 1 if missing (same guard
  style as `post --title`). `--persona` optional → sent as `""`.
- `--add` registers an additional agent even when credentials already exist.
- `--no-open` skips launching the browser (URL is still printed).
- Model flags optional; **omitted by default** (we send only what we can answer:
  `client_name="ottoman"`, `client_version` from `package.json`). `SOFA_MODEL_NAME`
  also feeds `--model-name` if set, for parity with the rest of the CLI.
- `--json` emits the final `{agent_id, agent_name, api_key_prefix, api_key_suffix}`
  — **never** the full key.

Single blocking command. Example run:

```
  Authorize ottoman with Stack Overflow for Agents
  Verify this code in your browser:   EUNC-4399
  Opening https://agents.stackoverflow.com/onboarding/claim/71b0…
    (didn't open? visit the URL above)
  Waiting for you to sign in and authorize…  (Ctrl-C to cancel)
  Authorized — registering drakulavich-agent…
  Signed in as drakulavich-agent — rep 0. Key stored in ~/.sofa/credentials.json (agent 5c003656…)

  Next:  sofa whoami      sofa search <query>
```

## Architecture

| File | Responsibility |
|---|---|
| `src/onboarding.ts` | `OnboardingClient` — unauthenticated `fetch` over the onboarding endpoints: `createFlow(meta)`, `pollStatus(flowId, pollToken)`, `register(authCode, values)`. Reuses `errorDetail()` from `client.ts`. Takes `{ baseUrl, delayMs?, now?() }` so the poll loop is injectable/instant in tests. No fs, no env. |
| `src/open-url.ts` | `openUrl(url): Promise<boolean>` — best-effort platform launch (macOS `open`, Linux `xdg-open`, Windows `cmd /c start`) via `Bun.spawn` (unref'd). Returns whether an opener launched. Pure side-effect helper, injected into the CLI. |
| `src/credentials.ts` | extend with `saveCredential(agentId, entry)` — load store, merge the new agent keyed by `agent_id`, write via temp+rename + chmod 600 (mirrors the ledger fix). Call-time HOME. |
| `src/cli.ts` | `init` case orchestrates the flow + verify; reads existing credentials for the idempotency guard; wires `openUrl` and a `makeClient`-style verify. |

## Data flow

1. **createFlow** `{client_name:"ottoman", client_version, …optional model fields}`
   → `{flow_id, claim_url, claim_code, poll_token, poll_after_seconds, expires_at}`.
   Print the code + URL; `openUrl(claim_url)` unless `--no-open`/headless.
2. **poll** `pollStatus(flow_id, poll_token)` every `max(poll_after_seconds, 2s)`
   until `state==="auth_code_retrieved"` (→ `auth_code`), or `expires_at` passes /
   `state` terminal (`expired`/`denied`) → print `recovery` + exit 2.
3. **register** `(auth_code, {agent_name, description, persona})`
   → `{agent_id, api_key, api_key_prefix, api_key_suffix}`.
4. **saveCredential** `(agent_id, {agent_name, base_url, api_key, api_key_prefix, api_key_suffix})`.
5. **verify** open a session + `whoami` with the new key; print the live identity.

## Error handling

- **Existing credentials, no `--add`:** stop before starting a flow — print
  "already configured as `<name>` (`sofa whoami`); pass `--add` to register
  another"; exit 1. With `--add`: proceed and merge. If the store ends up with
  >1 agent, print that subsequent commands now need `--agent=<id>` /
  `SOFA_AGENT_ID` (since `loadCredentials` auto-selects only when there's one).
  Never overwrite an existing `agent_id` (fresh id per register makes collision a
  non-event; refuse if it ever happens).
- **Flow / auth_code expiry, denied:** print the API's `recovery` text verbatim
  plus the exact retry command (`sofa init …`); exit 2. Expired claims can't be
  resumed.
- **Exit codes:** 0 success, 1 bad args / already-configured, 2 API / flow
  failure.

## UX (Pareto vital few)

1. **Auto-open the claim URL** — the headline DX win; always also printed;
   `--no-open` + headless (no TTY / no `DISPLAY` / opener fails) auto-degrade to
   print-only, so it never depends on the open succeeding.
2. **Verify and prove** — end on a real `whoami` (`Signed in as X — rep N`), not
   "key saved". One request; the difference between "I wrote a file" and "you're
   in and it works".
3. **Idempotency guard** — re-running `init` doesn't silently create a second
   agent (the 1→2 footgun that then forces `--agent` everywhere); it stops unless
   `--add`.

No ANSI color (consistent with ottoman's plain-text house style); clarity comes
from structure and `gh`-style `✓`/`!` glyphs, not color.

## Testing

Fake `Bun.serve` server (existing pattern) that **advances state across poll
calls** (`pending_claim`→`claim_viewed`→`auth_code_retrieved`), modelling the
real flow with no human. Inject `delayMs=0` so the poll loop is instant.
`openUrl` stubbed (record the URL; return true/false to exercise the opened and
print-only branches). Spinner/TTY niceties are out, so output is deterministic.

Cover: happy path (flow→poll→register→credential written + chmod 600→verify
whoami printed); `--no-open` prints the URL and never calls the opener;
already-configured without `--add` → exit 1 + guidance; `--add` merge → >1-agent
note; flow expiry → exit 2 + recovery; missing `--name` → exit 1; key never
appears in stdout/`--json`. The only untestable bit — a real browser tab — is
isolated to the injected `openUrl`.

## OpenSpec workflow

Lands as one change, **`add-init`** (slot #5 in `openspec/project.md`):

- `openspec/changes/add-init/proposal.md` + `tasks.md`.
- Implemented TDD, then `git mv` to `openspec/changes/archive/` with tasks ticked
  `[x]` — same lifecycle as `add-credentials-and-session` … `add-cli`.

## Risks

- **Beta onboarding API drift.** Mitigated by the spec-drift test (extend its
  CALLS table with the onboarding endpoints/fields `init` reads) and the
  hand-written client keeping the fix surface small.
- **Browser-open portability.** Best-effort with a guaranteed print-only
  fallback; `init` never blocks on the open succeeding.
- **auth_code expiry.** Structurally avoided by collecting registration values
  upfront — register fires with zero human delay.
