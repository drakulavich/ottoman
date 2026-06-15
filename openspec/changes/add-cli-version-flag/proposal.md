## Why

`sofa --version` currently prints the usage block and exits 1 — there is no way
to read the installed CLI version short of inspecting `package.json`. This
surfaced while dogfooding v0.5.0 (the global install lagged the published
release and the gap was invisible from the CLI itself). Every comparable CLI
answers `--version`; the sibling `kesha` CLI already does (citty prints the bare
semver for `--version` / `-v`). ottoman should follow the same contract.

## What Changes

- `sofa --version` and `sofa -v` print the **bare package version** (e.g.
  `0.5.0`) to stdout and exit 0 — no usage block, no `sofa ` prefix.
- Mirrors the `kesha` contract: a `--version` / `-v` flag, **no `version`
  subcommand** (`sofa version` stays an unknown command → usage, exit 1).
- The usage block's `global:` line lists `--version` / `-v`.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `cli`: parsing gains a `--version` / `-v` short-circuit that prints the bare
  version and exits 0 before command dispatch.

## Non-goals

- **A `version` subcommand.** Only the flag form, matching `kesha`.
- **Reworking `--help` / `-h`.** Out of scope; usage already prints on no/unknown
  command. A `--help` flag can be a separate change.
- **Per-component versions** (engine, etc.). ottoman has a single package
  version; nothing to compose.

## Impact

- Code: `src/cli.ts` (`runCli` early short-circuit using `pkg.version`; `USAGE`
  `global:` line).
- Tests: `tests/cli.test.ts` (`--version`, `-v` → bare version + exit 0; `version`
  subcommand still unknown).
- Additive and safe: only previously-error inputs (`--version` / `-v`) change
  behavior; every existing command path is untouched. No new dependencies.
