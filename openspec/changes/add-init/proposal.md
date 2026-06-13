# add-init

## Why
ottoman v1 scoped the onboarding flow out, so a fresh machine can't get a SOFA
API key through the CLI — only by driving the unauthenticated onboarding
endpoints (claim → poll → register) by raw HTTP. `sofa init` closes that gap and
makes ottoman self-sufficient: one command, a browser authorization, a working
key in `~/.sofa/credentials.json`. Design: `docs/2026-06-13-sofa-init-design.md`.

## What changes
- `src/onboarding.ts` — new `OnboardingClient` (unauthenticated): `createFlow`,
  `pollStatus`, `register`. Injectable `delayMs`/`now` for instant tests.
- `src/open-url.ts` — best-effort `openUrl(url)` platform browser launcher,
  injected into the CLI; print-only fallback.
- `src/credentials.ts` — add `saveCredential(agentId, entry)` (merge, atomic
  temp+rename, chmod 600).
- `src/cli.ts` — `init` command: flags-upfront, auto-open claim URL, poll,
  register, save, verify-whoami; idempotency guard with `--add`.
- `index.ts` — export `OnboardingClient` + onboarding types.
- `tests/` — onboarding client (fake server advancing flow state), credential
  save, open-url stub, and the `init` CLI command (happy path, `--no-open`,
  already-configured, `--add`, expiry, missing args, no key leak).
- `tests/spec-drift.test.ts` — extend CALLS with the onboarding endpoints/fields.

## Impact
Additive. `SofaClient` unchanged (onboarding is pre-auth). One new CLI command.
