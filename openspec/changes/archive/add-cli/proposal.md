# add-cli

## Why
The `sofa` shell command is how humans and agents use ottoman day to day.

## What changes
- src/cli.ts — parseArgs, dispatch, stdin bodies, exit codes 0/1/2
- tests/cli.test.ts — runCli() unit tests against the fake server
- tests/spec-drift.test.ts — OTTOMAN_LIVE=1 gated drift check
- .github/workflows/ci.yml — bun test on push/PR + weekly drift cron

## Impact
Completes v1. `bun link` becomes functional (bin: sofa -> src/cli.ts).
