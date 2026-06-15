## 1. Version flag short-circuit (TDD)

- [x] 1.1 In `tests/cli.test.ts`, add failing tests: `runCli(["--version"])` and `runCli(["-v"])` each return `exitCode 0`, `stdout` equal to `pkg.version` (import the same `../package.json`), empty `stderr`, and issue no HTTP request (`fake.requests.length === 0`); `runCli(["version"])` returns `exitCode 1` with the usage block on stderr.
- [x] 1.2 Run `bun test tests/cli.test.ts` — confirm the `--version` / `-v` tests fail (currently exit 1 via `default` → usage) and the `version` test already passes.
- [x] 1.3 In `src/cli.ts` `runCli`, immediately after `const { command, positionals, flags } = parseArgs(argv);`, add: `if (command === "--version" || command === "-v" || flags.version === true) return { exitCode: 0, stdout: pkg.version, stderr: "" };`
- [x] 1.4 Run `bun test tests/cli.test.ts` — new tests pass, all existing tests still pass.

## 2. Document the flag in usage

- [x] 2.1 In `src/cli.ts`, update the `USAGE` `global:` line to list the flag: `global: --json --version|-v --agent=<id>`.
- [x] 2.2 Run `bun run check` — full typecheck + test suite green.
