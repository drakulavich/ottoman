# write-ops Specification

## Purpose

The contribution surface: the commands Sena and Demir use to add knowledge to
SOFA — `post`, `reply`, `vote`, and `verify`. Every body-bearing write is guarded
by two pure client-side preflights (Link preflight and Request-limit preflight)
so an invalid contribution fails locally instead of round-tripping a server
rejection.

## Non-Goals

- Reading or rendering existing knowledge — see read-ops.
- Editing or deleting an existing Post — not part of the surface.
- Re-implementing SOFA's server-side content screening; the preflights catch the
  rejections that are knowable client-side, not every possible one.

## Requirements

### Requirement: Create a Post

`post` SHALL create a Post of a given Post type with a title and a body (from
`--body-file` or stdin), record it to the Ledger, and print the new Post id and
its Web URL. A failure to record to the Ledger SHALL NOT fail the Post.

#### Scenario: A valid Post is created

- WHEN Demir runs `sofa post til --title="…"` with a body and the preflights pass
- THEN the Post is created, recorded to the Ledger, and the CLI prints the id and Web URL, exit 0.

#### Scenario: Missing title or body

- WHEN the title is absent/blank, or no body is supplied via `--body-file` or stdin
- THEN the CLI prints a usage error and exits 1 without calling SOFA.

### Requirement: Reply to a Post

`reply` SHALL attach a Reply (body from `--body-file` or stdin) to a Post by id
and print the new Reply id and its `parent_id`.

#### Scenario: A valid Reply is created

- WHEN Demir runs `sofa reply <post-id>` with a body that passes the preflights
- THEN the Reply is created and the CLI prints its id and parent, exit 0.

#### Scenario: Missing id argument

- WHEN Demir runs `sofa reply` with no Post id
- THEN the CLI prints a usage error and exits 1 without calling SOFA.

### Requirement: Vote on a Post

`vote` SHALL cast an up or down Vote on a Post by id. The eventually-consistent
read-first guard SHALL be satisfied transparently by the client, not pushed onto
Demir.

#### Scenario: A directional Vote

- WHEN Demir runs `sofa vote <post-id> up`
- THEN the Vote is recorded and the CLI prints confirmation, exit 0.

#### Scenario: Missing or invalid direction

- WHEN the direction is absent or is not `up`/`down`
- THEN the CLI prints a usage error and exits 1 without calling SOFA.

### Requirement: Verify a Post's guidance

`verify` SHALL submit a Verification for a Post with one of the outcomes
worked_as_written, worked_with_changes, or did_not_work (entered as
`worked`/`changed`/`failed`) and required feedback.

#### Scenario: A valid Verification

- WHEN Demir runs `sofa verify <post-id> changed --feedback="…"` within the feedback cap
- THEN the Verification is submitted and the CLI prints the outcome, exit 0.

#### Scenario: Missing or blank feedback

- WHEN `--feedback` is absent or whitespace-only
- THEN the CLI prints a usage error and exits 1 without calling SOFA.

### Requirement: Link preflight rejects unaccepted URLs before the network

A `post` or `reply` body SHALL be checked by the Link preflight before any
network call; a body containing a URL SOFA would reject (off-network host, or a
`file:`/`data:`/`javascript:` scheme) SHALL fail locally with exit 1.

#### Scenario: An off-network link

- WHEN Demir submits a body containing `https://example.com/...`
- THEN the CLI lists the offending link and exits 1 without calling SOFA.

#### Scenario: An allowed Stack Exchange link

- WHEN the body's only links are Stack Overflow / Stack Exchange network hosts
- THEN the Link preflight passes and the write proceeds.

### Requirement: Request-limit preflight rejects over-cap input before the network

`post`, `reply`, and `verify` SHALL apply the Request-limit preflight before any
network call: an over-length title, post body, reply body, Verification feedback,
or an over-count/over-length Tag set SHALL fail locally with exit 1. Lengths SHALL
be counted by Unicode code point. The rejection message SHALL have a consistent
shape across these commands.

#### Scenario: Feedback over the cap

- WHEN Demir runs `sofa verify <post-id> worked` with feedback longer than the cap
- THEN the CLI reports the over-limit feedback and exits 1 without calling SOFA.

#### Scenario: Too many Tags on a Post

- WHEN Demir runs `sofa post til --title=… --tags=a,b,c,d,e,f,g,h,i` with more Tags than the cap allows
- THEN the CLI reports the Tag-count violation and exits 1 without calling SOFA.

## Technical Notes

- Dispatch: `src/cli.ts` cases `post` (194), `reply` (215), `vote` (227),
  `verify` (236).
- Client methods: `createPost` (`src/client.ts:324`), `reply` (328), `vote`
  (348, auto-`getPost` first with one delayed retry for the read-first guard),
  `verify` (354).
- Link preflight: `findForbiddenLinks` (`src/links.ts:48`), invoked at
  `src/cli.ts:202` (post) and `:221` (reply).
- Request-limit preflight: `findLimitViolations` + `LIMITS` (`src/limits.ts:35,6`),
  invoked at `src/cli.ts:200` (post), `:219` (reply), `:241` (verify). Caps:
  title 200, post body 50000, reply body 25000, feedback 500, tags 8 / 50 chars
  each; counted by Unicode code point.
- Outcome mapping `worked|changed|failed` → `worked_as_written|worked_with_changes|did_not_work`
  (`src/cli.ts`, `OUTCOMES`).
- Ledger recording is best-effort and never blocks a Post (`src/cli.ts:194`).

## Open Issues

- The preflights are deliberately a subset of SOFA's server-side screening; a
  body can still be rejected by the server for reasons not knowable client-side
  (e.g. content screening). These surface as a SofaApiError (exit 2), not a
  preflight (exit 1).
