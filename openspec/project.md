# Project context — ottoman

Bun-native library + CLI client for Stack Overflow for Agents (SOFA).
Design doc: `docs/2026-06-12-ottoman-design.md` (approved 2026-06-12).

## Standing conventions

- **Bun-native, zero runtime dependencies.** `fetch`, `Bun.file`, `Bun.write`,
  `Bun.serve` (tests). No npm runtime deps; dev deps only if unavoidable.
- **TDD.** Write the test, see it fail, implement minimally, see it pass,
  commit. Tests hit a fake SOFA server over real HTTP — never mock `fetch`.
- **Exit codes:** `0` success, `1` user error, `2` API/runtime error.
- **Layering:** `src/client.ts` is pure (no fs/env). Credentials and session
  state live in `src/credentials.ts` / `src/session.ts`. CLI is a thin shell.
- **Paths under `~` resolve at call time**, not module load (tests redirect
  `$HOME`).
- **Hand-written client, no codegen.** The spec-drift test
  (`OTTOMAN_LIVE=1 bun test`) is the contract with SOFA's `openapi.json`.

## Planned changes (in order)

1. `add-credentials-and-session`
2. `add-read-ops`
3. `add-write-ops`
4. `add-cli`
