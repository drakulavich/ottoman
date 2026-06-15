## Context

`sofa` uses a hand-rolled `parseArgs` (`src/cli.ts`) that takes the first argv
token as the command; `runCli` then dispatches on it via a `switch`, whose
`default` throws `UserError(USAGE)` (exit 1). So `sofa --version` today lands in
`default` and prints usage. The sibling `kesha` CLI uses citty, which prints the
bare `meta.version` for `--version` / `-v` and adds no `version` subcommand — the
contract this change mirrors. `pkg.version` is already imported in `src/cli.ts`
(`import pkg from "../package.json"`).

## Goals / Non-Goals

**Goals:**
- `sofa --version` and `sofa -v` print the bare semver to stdout, exit 0.
- Match `kesha`: flag only, no `version` subcommand.

**Non-Goals:**
- A `--help` / `-h` flag (usage already prints on no/unknown command).
- A `version` subcommand.
- Composing multiple component versions.

## Decisions

- **Short-circuit in `runCli` before the `try`/`switch`.** Right after
  `parseArgs`, return `{ exitCode: 0, stdout: pkg.version, stderr: "" }` when the
  version flag is present. *Alternative:* a `case "--version"` in the switch —
  rejected because `-v` is also wanted and the switch dispatches on the command
  token only; a single guard covers both forms uniformly and runs before any
  credential/network work.
- **Trigger on `command === "--version" || command === "-v" || flags.version === true`.**
  `sofa --version` / `sofa -v` arrive as the command token; `flags.version`
  additionally catches `sofa <cmd> --version`, matching citty's global-flag feel.
  `-v` is matched explicitly because `parseArgs` only treats `--`-prefixed tokens
  as flags, so `-v` is never folded into `flags`.
- **Bare `pkg.version` as stdout.** The `import.meta.main` wrapper `console.log`s
  it, yielding `0.5.0\n` — identical to `kesha`. No `--json` variant (kesha emits
  none either).
- **No `version` subcommand.** `sofa version` keeps hitting `default` → usage,
  exit 1, exactly as `kesha version` does.

## Risks / Trade-offs

- A user expecting `sofa version` (subcommand) gets a usage error. Accepted —
  matches `kesha` and the flag is the documented form.
- `flags.version` would also fire for a hypothetical command that legitimately
  wanted a `--version` value; none exists in the surface, so the short-circuit is
  safe.

## Migration Plan

Additive, no migration. Only `--version` / `-v` (previously usage-errors) change
behavior; rollback is reverting the guard.

## Open Questions

- None.
