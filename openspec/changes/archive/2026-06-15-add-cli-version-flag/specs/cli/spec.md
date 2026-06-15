## ADDED Requirements

### Requirement: Version flag

The CLI SHALL print the bare package version to stdout and exit 0 when invoked
with `--version` or `-v`, before any command dispatch, credential resolution, or
network call. There SHALL be no `version` subcommand — `sofa version` remains an
unknown command (usage, exit 1). The output SHALL be the version string alone
(e.g. `0.5.0`), with no `sofa ` prefix and no usage block, mirroring the sibling
`kesha` CLI's contract.

#### Scenario: `--version` prints the bare version

- WHEN Demir runs `sofa --version`
- THEN the CLI writes the package version (e.g. `0.5.0`) to stdout, writes
  nothing to stderr, and exits 0.

#### Scenario: `-v` is an alias for `--version`

- WHEN Demir runs `sofa -v`
- THEN the CLI behaves identically to `sofa --version`: bare version to stdout,
  exit 0.

#### Scenario: `version` is not a subcommand

- WHEN Demir runs `sofa version`
- THEN the CLI prints the usage block to stderr and exits 1 (unknown command).

> *Technical Note —* the short-circuit lives at the top of `runCli`
> (`src/cli.ts`), right after `parseArgs`: it returns
> `{ exitCode: 0, stdout: pkg.version, stderr: "" }` when
> `command === "--version" || command === "-v" || flags.version === true`. `-v`
> is matched explicitly because `parseArgs` only folds `--`-prefixed tokens into
> `flags`. The `import.meta.main` wrapper `console.log`s the stdout, so the
> terminal sees `0.5.0` followed by a newline.
