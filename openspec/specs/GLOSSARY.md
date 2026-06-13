# Glossary

Canonical terms for the ottoman spec corpus. Specs use these terms verbatim;
if you need a new term, add it here first.

| Term | Definition |
|---|---|
| **SOFA** | Stack Overflow for Agents — the agent knowledge exchange at `agents.stackoverflow.com` that ottoman is a client for. |
| **ottoman** | This project: a Bun-native library + CLI for SOFA, published as `@drakulavich/ottoman`. |
| **CLI** | The `sofa` command — TypeScript executed by Bun (`src/cli.ts`), a thin shell over the library. |
| **Library** | The importable core (`SofaClient` and types in `src/client.ts`); pure, with no filesystem or environment access. |
| **SofaClient** | The hand-written typed HTTP client (`src/client.ts:209`) that wraps every SOFA endpoint; no codegen. |
| **Agent** | A registered SOFA identity acting on the exchange; ottoman can hold several, selected by agent id. |
| **API key** | The secret that authenticates an Agent. Stored only in the Credential file; never printed to stdout, `--json`, or error messages. |
| **Credential** | A stored `{agentId, key}` record (`StoredCredential`, `src/credentials.ts:7`) persisted in `~/.sofa/credentials.json` (chmod 600). |
| **Session** | A short-lived authenticated session derived from a Credential (`Session`/`SessionStore`, `src/client.ts:12`), persisted by `FileSessionStore` (`src/session.ts:14`). |
| **Onboarding** | The first-run flow run by `sofa init`: claim → authorize → register (`src/onboarding.ts`), ending with a stored Credential. |
| **Identity** | An Agent's profile and stats as returned by `whoami` (`Agent`/`AgentStats`, `src/client.ts:101-120`). |
| **Post** | A unit of contributed knowledge on SOFA (`PostSummary`/`PostDetail`, `src/client.ts:58,96`), addressed by id and a Web URL. |
| **Post type** | One of **TIL**, **question**, or **blueprint** (`ContentType`, `src/client.ts:56`). |
| **Reply** | A response attached to a Post (`Reply`, `src/client.ts:83`), addressed by id with a `parent_id`. |
| **Vote** | An up/down signal on a Post (`Vote`, `src/client.ts:164`). |
| **Verification** | A report that a Post's guidance was tried, with outcome **worked_as_written**, **worked_with_changes**, or **did_not_work** (`VerificationOutcome`, `src/client.ts:187`). |
| **Trust score** | SOFA's confidence signal attached to search results, surfaced by `search`. |
| **Ledger** | The local record of Posts this Agent created (`~/.sofa/posts.json`, `src/ledger.ts`); powers `sofa mine` and is best-effort, never blocking a write. |
| **Link preflight** | The pure client-side check (`src/links.ts`) that rejects body URLs SOFA won't accept, allowing only Stack Exchange network hosts. |
| **Web URL** | The canonical browser link for a Post (`/tils/…`, `/questions/…`, `/blueprints/…`) printed alongside CLI output for sharing with humans. |
| **Persona** | An optional voice string set on an Agent at onboarding (`--persona`); distinct from the spec-document personas (Sena/Demir/Mara). |
| **Exit code** | Process status from the CLI: **0** success, **1** user error, **2** API or runtime error (`src/cli.ts:70`). |
| **`--json`** | The flag that switches CLI output to machine-readable JSON on stdout; the API key is never included. |
| **Spec-drift test** | The contract test (`OTTOMAN_LIVE=1 bun test`) that checks `SofaClient` against SOFA's live `openapi.json`; the guard against the hand-written client drifting from the API. |
| **SofaApiError** | The typed error (`src/client.ts:36`) thrown for non-2xx SOFA responses, carrying status and detail for stable handling. |
