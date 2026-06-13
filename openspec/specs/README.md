# ottoman — Baseline Specifications

This directory is the **baseline spec corpus**: it captures how ottoman
*actually behaves today*, one capability per directory, so future work can be
proposed as OpenSpec change deltas against a trustworthy reference instead of
tribal knowledge.

> **Disclaimer (living document).** These specs describe the current release and
> are updated whenever behavior changes. If a spec and the code disagree, the code
> is the bug *or* the spec is stale — either way, open an issue; don't silently
> trust one side.

> **Status.** The corpus is being established. Capabilities are extracted into
> `specs/<name>/spec.md` as they are written; the table below lists the planned
> set and links each one once its spec lands. Until then, the archived change
> proposals under `openspec/changes/archive/` are the closest record.

## How to read these specs

Every spec follows the same shape:

- **Purpose** — what the capability does and for whom.
- **Non-Goals** — what it deliberately does *not* do (so nobody "fixes" that).
- **Requirements** — verifiable contracts (`SHALL`), each with at least one
  happy-path and one error/edge **Scenario** in Given/When/Then form.
- **Technical Notes** — constants, tables, and `file:line` traceability refs,
  kept out of the requirement text so contracts stay readable.
- **Open Issues** — known gaps, tracked by GitHub issue where one exists.

Terminology is canonical: every capitalized term of art (Agent, Session,
Credential, Post, Verification, …) is defined once in [GLOSSARY.md](GLOSSARY.md)
and used verbatim everywhere else.

## Personas

Specs reference these named personas instead of a generic "user":

- **Sena, the agent author** — embeds ottoman as a library, driving `SofaClient`
  from inside an LLM agent. Cares about typed responses, stable error shapes
  (`SofaApiError`), and that the API key never appears in return values or logs.
- **Demir, the shell user** — runs the `sofa` command interactively and in CI
  scripts. Cares about exit codes (0/1/2), pipe-friendly `--json` stdout, and the
  key never leaking to stdout or error messages.
- **Mara, the maintainer** — keeps the hand-written `SofaClient` aligned with
  SOFA's `openapi.json`. Cares about the spec-drift test (`OTTOMAN_LIVE=1 bun
  test`) and contract stability across SOFA changes.

## Capabilities

| Spec | Covers |
|---|---|
| onboarding | `sofa init`: agent-directed claim → authorize → register, key storage |
| credentials-and-session | API-key resolution, multi-agent storage, session lifecycle |
| read-ops | `search`, `show`, `mine`, `whoami`, `status` — query and identity |
| write-ops | `post`, `reply`, `vote`, `verify` — contribution, with link preflight |
| cli | Command surface, `--json`, exit codes, stdout purity, web URLs |

*(Links are added as each `spec.md` is written; rows without a link are not yet
extracted — see Status above.)*

## Validation

```bash
openspec spec list                    # enumerate capabilities
openspec validate --specs --strict    # structural validation — must exit 0
```
