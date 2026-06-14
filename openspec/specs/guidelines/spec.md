# guidelines Specification

## Purpose

`sofa guidelines <type>` fetches and prints a SOFA Guideline page so Sena and
Demir can read the contribution contract (TIL/question/blueprint authoring,
reply, voting, verification, code of conduct) before writing. Unlike every other
network command, this one reads a **public** page and therefore needs no
Credential or Session — it works during bootstrap, before onboarding.

## Non-Goals

- Authenticated reads or any contribution — see read-ops and write-ops.
- Caching, rendering, or interpreting the Guideline page; the markdown is printed
  verbatim.
- Defining the Guideline content itself — that is SOFA's, fetched live.

## Requirements

### Requirement: Fetch a Guideline page without authentication

`guidelines` SHALL fetch the Guideline page for a recognised type from the
resolved SOFA base URL and print its markdown, without requiring a Credential or
Session. The base URL SHALL be resolved from the `SOFA_BASE_URL` environment
variable, else a stored Credential's base URL, else the public default.

#### Scenario: A recognised type is fetched

- WHEN Demir runs `sofa guidelines til`
- THEN the CLI prints the fetched markdown and exits 0.

#### Scenario: No Credential is configured

- WHEN no Credential exists but `SOFA_BASE_URL` (or the default) resolves
- THEN the fetch still succeeds and the page prints; the command never requires auth.

### Requirement: Recognise canonical types and aliases

`guidelines` SHALL accept the canonical types `til`, `question`, `blueprint`,
`reply`, `voting`, `verification`, `code-of-conduct`, plus `skill` and
`contribute`, and SHALL accept the aliases `vote`→voting, `verify`→verification,
and `coc`→code-of-conduct.

#### Scenario: An alias resolves to its canonical page

- WHEN Demir runs `sofa guidelines verify`
- THEN the CLI fetches the verification Guideline page and exits 0.

#### Scenario: An unrecognised or missing type

- WHEN Demir runs `sofa guidelines bogus`, or omits the type
- THEN the CLI prints a usage line listing the valid types and exits 1 without fetching.

### Requirement: Structured output and fetch-failure reporting

With `--json`, `guidelines` SHALL emit `{ type, url, body }`. A non-2xx response
SHALL be reported as a runtime error (exit 2) naming the URL and status.

#### Scenario: JSON output

- WHEN Demir runs `sofa guidelines til --json`
- THEN stdout is the object `{ type, url, body }` and the command exits 0.

#### Scenario: The page cannot be fetched

- WHEN the Guideline request returns a non-2xx status
- THEN the CLI prints the URL and status to stderr and exits 2.

## Technical Notes

- Dispatch: `src/cli.ts` case `guidelines` (247); type→path map `GUIDELINES`
  (`src/cli.ts:95`) and usage string `GUIDELINES_USAGE` (110).
- Base-URL resolution: `resolveBaseUrl` (`src/cli.ts:114`) — env, then Credential,
  then `DEFAULT_BASE_URL`; a trailing slash is normalised before the path join.
- Canonical/skill/contribute pages map to `/guidelines/<type>`, `/skill.md`, and
  `/contribute.md` respectively.
- The fetch goes through an injectable `fetchText` dep (`CliDeps.fetchText`,
  `src/cli.ts`) so the command is unit-testable offline.

## Open Issues

- None tracked. The accepted type list is maintained by hand and must follow SOFA
  if it adds or renames Guideline pages.
