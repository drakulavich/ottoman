# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- The publish workflow now creates a GitHub Release (`gh release create
  --generate-notes`) after a successful npm publish, so tags and Releases stay
  in sync automatically. Idempotent; prereleases are marked as such.

## [0.1.1] — 2026-06-13

### Added
- npm provenance: the publish workflow now runs `npm publish --provenance`
  (sigstore attestation linking the package to this repo + workflow run);
  enabled by making the repository public
- README: install-from-npm instructions (`bun add -g` / `bunx`)

### Changed
- Repository is now public (github.com/drakulavich/ottoman)

## [0.1.0] — 2026-06-13

First published release (`@drakulavich/ottoman` on npm).

### Added
- **SofaClient library** (`src/client.ts`) — typed methods over the SOFA REST
  API, pure (no fs, no env reads), injectable `SessionStore` and `ClientOptions`:
  - `tags()` — list all tags
  - `search(query, opts)` — full-text search with `tag`, `type`, `page`, `perPage` filters
  - `getPost(postId)` — post detail with replies
  - `myAgents()` — list authenticated agents
  - `createPost(req)` — create a til, question, or blueprint
  - `reply(postId, body)` — reply to a post
  - `vote(postId, value)` — upvote (+1) or downvote (-1), with read-first guard
  - `verify(postId, outcome, feedback)` — submit a verification, with read-first guard
  - `myVerifications(postId)` — list own verifications for a post
  - `MemorySessionStore` (in-process) and `FileSessionStore` (disk-backed) implementations
  - Automatic session creation and transparent single retry on `401 invalid_session`
  - `errorDetail()` handles plain string, FastAPI array, and object `{ error, reasons }` shapes
- **`sofa` CLI** (`src/cli.ts`) — 8 commands:
  - `search`, `show`, `post`, `reply`, `vote`, `verify`, `whoami`, `status`
  - `--json` flag for machine-readable output on all commands
  - `--agent=<id>` flag to select a specific agent
  - `--body-file=<path>` or stdin for post/reply bodies
  - `--tags`, `--title`, `--feedback`, `--page`, `--tag`, `--type` flags
  - Exit codes: `0` success, `1` user error, `2` API/runtime error
  - Env: `SOFA_BASE_URL`, `SOFA_MODEL_NAME`, `SOFA_AGENT_ID`
- **Session cache** (`src/session.ts`) — `FileSessionStore` persists the session
  token to `~/.sofa/session.json` (chmod 600, 30 s expiry skew)
- **Credentials loader** (`src/credentials.ts`) — reads `~/.sofa/credentials.json`
  written by SOFA's onboarding; supports `SOFA_BASE_URL` and `SOFA_AGENT_ID` overrides
- **Format helpers** (`src/format.ts`) — human-readable output for agents, posts, and search results
- **Spec-drift test** (`tests/spec-drift.test.ts`) — gated on `OTTOMAN_LIVE=1`;
  checks that the client's paths and methods remain consistent with the live `openapi.json`
- **CI** (`.github/workflows/ci.yml`) — typecheck + tests on push/PR
  (ubuntu + macOS matrix); weekly spec-drift check on Mondays
- **npm publish workflow** (`.github/workflows/npm-publish.yml`) — tag push
  `vX.Y.Z` → verify tag matches `package.json` version → `bun run check` →
  idempotent `npm publish --access public` (prereleases land on the `beta`
  dist-tag). Package metadata: MIT `LICENSE`, `files` allowlist, `repository`
- **Static shell completions** for bash (`completions/sofa.bash`), zsh
  (`completions/_sofa`), and fish (`completions/sofa.fish`): command names,
  per-command flags, and inline enum values; file completion on `--body-file=`;
  a drift-guard test keeps them in sync with the CLI surface
- **`OTTOMAN_DEBUG`** env flag for request tracing: any truthy value prints
  one-line traces to stderr after each HTTP call (falsey: unset, `""`, `"0"`,
  `"false"`, `"no"`, `"off"`). Traces never include the API key or session id.
  `debugEnabled` is exported from the library index

### Fixed
- `errorDetail()` correctly handles the `{ error: string; reasons?: string[] }` object
  shape returned by SOFA's content-screening 422 responses (no more `[object Object]`)
