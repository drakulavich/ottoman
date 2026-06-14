# cli Specification

## Purpose

The `sofa` command surface itself, independent of any one subcommand: how Demir's
invocation is parsed, how exit codes are assigned, how `--json` switches output,
how the API key is kept out of all output, and how Web URLs are surfaced. This is
the contract every other capability inherits.

## Non-Goals

- The behaviour of individual subcommands — see read-ops, write-ops, guidelines,
  onboarding.
- Library (`SofaClient`) ergonomics for Sena — those are the library's contract,
  not the CLI's.
- Shell completion content (a generated artifact kept in sync by test, not a
  behavioural contract here).

## Requirements

### Requirement: Command and flag parsing

The CLI SHALL parse a leading command followed by positionals and `--flag` /
`--flag=value` arguments, where a bare `--flag` is boolean-true and a repeated
flag takes the last value. An unknown command SHALL print the usage block.

#### Scenario: Flags and positionals are separated

- WHEN Demir runs `sofa search query --tag=bun --json`
- THEN `query` is a positional, `tag` is `"bun"`, and `json` is true.

#### Scenario: Unknown command

- WHEN Demir runs `sofa frobnicate`
- THEN the CLI prints the usage block to stderr and exits 1.

### Requirement: Stable exit codes

The CLI SHALL exit 0 on success, 1 on a user error (usage, missing argument,
unresolved Credential, not-found ref), and 2 on an API or runtime error
(SofaApiError or unexpected failure).

#### Scenario: User error

- WHEN a command is missing a required argument
- THEN the CLI exits 1 and writes the reason to stderr.

#### Scenario: API error

- WHEN SOFA returns a non-2xx response that reaches the CLI as a SofaApiError
- THEN the CLI exits 2 and writes the status and detail to stderr.

### Requirement: `--json` selects machine-readable output

When `--json` is set, every command that produces output SHALL emit JSON on
stdout instead of the human rendering; without it, output is the human rendering.

#### Scenario: JSON on stdout

- WHEN Demir adds `--json` to a command that succeeds
- THEN stdout is valid JSON for that command's result and exit is 0.

#### Scenario: Human rendering by default

- WHEN `--json` is absent
- THEN stdout is the formatted human text for that command.

### Requirement: The API key never reaches output

No command SHALL print the API key to stdout, to `--json`, or in any error
message; the key lives only in the Credential file.

#### Scenario: Successful output stays key-free

- WHEN any command succeeds, in either human or `--json` mode
- THEN stdout contains no API key material.

#### Scenario: Errors stay key-free

- WHEN any command fails for any reason
- THEN the stderr message contains no API key material.

### Requirement: Web URLs accompany Post output

Commands that emit a single Post (`show`) or create one (`post`) SHALL print the
Post's Web URL so Demir can share a human-facing link.

#### Scenario: show prints a Web URL

- WHEN Demir runs `sofa show <post-id>` for an existing Post
- THEN the output includes the `/tils|/questions|/blueprints` Web URL.

#### Scenario: post prints a Web URL

- WHEN a Post is created
- THEN the output includes the created Post's Web URL alongside its id.

## Technical Notes

- Entry and dispatch: `runCli` / `parseArgs` (`src/cli.ts`); the command switch
  begins at `src/cli.ts:164`; `USAGE` at `:22`.
- `CliResult.exitCode` is typed `0 | 1 | 2` (`src/cli.ts:76`); the catch block
  maps `UserError`/`CredentialsError`→1 and `SofaApiError`/other→2.
- `--json` is handled by the shared `emit(data, text)` helper; the human path is
  the `src/format.ts` functions.
- Web URLs: `postWebUrl` (`src/url.ts:10`) printed by `show` (`src/cli.ts:186`)
  and `post` (`:194`).
- Dependency injection (`CliDeps`) keeps the CLI unit-testable: `makeClient`,
  `readStdin`, `openUrl`, `makeOnboardingClient`, `fetchText` (`src/cli.ts:67`).

## Open Issues

- None tracked.
