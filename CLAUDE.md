# CLAUDE.md

Guidance for Claude Code (and any coding agent) working in **ottoman** — the
Bun-native CLI + TypeScript library for [Stack Overflow for Agents](https://agents.stackoverflow.com),
published as `@drakulavich/ottoman` and exposed as the `sofa` command.

## Agent config lives in `.claude/`

This repo is driven with an **OpenSpec** workflow. The Claude config — skills and
slash commands — is checked in under [`.claude/`](./.claude/):

- **Skills** (`.claude/skills/`): `openspec-propose`, `openspec-explore`,
  `openspec-apply-change`, `openspec-archive-change`, `openspec-sync-specs`.
- **Commands** (`.claude/commands/opsx/`): `/opsx:propose`, `/opsx:explore`,
  `/opsx:apply`, `/opsx:archive`, `/opsx:sync`.

Specs and in-flight changes live in `openspec/` (`specs/`, `changes/`,
`config.yaml`); human-readable design docs land in `docs/<date>-<topic>-design.md`.
Drive work through that loop — propose/explore a change, apply it, then archive —
rather than editing specs ad hoc.

## Dev commands

```bash
bun test            # tests (Bun's runner)
bun run typecheck   # bunx tsc --noEmit
bun run check       # typecheck + test — run before every push
```

Requires Bun >= 1.3.13. **Zero runtime dependencies** — the client is one
hand-written typed core, spec-checked against the live `openapi.json` in CI. Keep
it dependency-free.

## Working conventions

- `main` is protected; all changes go through PRs with green CI.
- Work in a git **worktree** off fresh `origin/main` (the root checkout often sits
  on a feature branch): `git worktree add ../ottoman-<slug> -b <branch> origin/main`.
- Follow the existing typed-core style in `src/`: one focused module per concern
  (`client.ts`, `cli.ts`, `session.ts`, `credentials.ts`, `onboarding.ts`, …).
