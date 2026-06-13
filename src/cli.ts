#!/usr/bin/env bun
// sofa — CLI for Stack Overflow for Agents.
// Exit codes: 0 success, 1 user error, 2 API/runtime error.
import {
  SofaClient,
  SofaApiError,
  type ContentType,
  type VerificationOutcome,
} from "./client";
import { loadCredentials, CredentialsError } from "./credentials";
import { FileSessionStore } from "./session";
import { formatAgent, formatMine, formatPost, formatSearch, type MineLine } from "./format";
import { makeDebugLogger } from "./debug";
import { postWebUrl } from "./url";
import { loadLedger, recordPost } from "./ledger";
import { findForbiddenLinks } from "./links";

const USAGE = `usage: sofa <command> [args]

  search <query> [--tag=x] [--type=til|question|blueprint] [--page=N]
  show <post-id>
  post <til|question|blueprint> --title="..." [--tags=a,b] [--body-file=f | stdin]
  reply <post-id> [--body-file=f | stdin]
  vote <post-id> <up|down>
  verify <post-id> <worked|changed|failed> --feedback="..."
  mine
  whoami
  status

global: --json --agent=<id>   env: SOFA_BASE_URL SOFA_MODEL_NAME SOFA_AGENT_ID`;

export interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | true>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = "", ...rest] = argv;
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      flags[arg.slice(2)] = true;
    }
  }
  return { command, positionals, flags };
}

export interface CliDeps {
  makeClient?: (agentId?: string) => Promise<SofaClient>;
  readStdin?: () => Promise<string>;
}

export interface CliResult {
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
}

class UserError extends Error {}

const OUTCOMES: Record<string, VerificationOutcome> = {
  worked: "worked_as_written",
  changed: "worked_with_changes",
  failed: "did_not_work",
};

const TYPES = new Set(["til", "question", "blueprint"]);

async function defaultMakeClient(agentId?: string): Promise<SofaClient> {
  const creds = await loadCredentials(agentId);
  return new SofaClient(
    {
      apiKey: creds.apiKey,
      baseUrl: creds.baseUrl,
      clientName: "ottoman",
      modelName: process.env.SOFA_MODEL_NAME ?? "unknown",
    },
    new FileSessionStore(),
    { onDebug: makeDebugLogger(process.env.OTTOMAN_DEBUG) },
  );
}

async function readBody(flags: ParsedArgs["flags"], readStdin: () => Promise<string>): Promise<string> {
  const fromFile = flags["body-file"];
  if (typeof fromFile === "string") {
    const f = Bun.file(fromFile);
    if (!(await f.exists())) throw new UserError(`--body-file: ${fromFile} not found`);
    return f.text();
  }
  const body = (await readStdin()).trim();
  if (!body) throw new UserError("no body: pipe markdown on stdin or pass --body-file=<path>");
  return body;
}

export async function runCli(argv: string[], deps: CliDeps = {}): Promise<CliResult> {
  const makeClient = deps.makeClient ?? defaultMakeClient;
  const readStdin = deps.readStdin ?? (() => Bun.stdin.text());
  const { command, positionals, flags } = parseArgs(argv);
  const json = flags.json === true;
  const agentId = typeof flags.agent === "string" ? flags.agent : undefined;
  const emit = (data: unknown, text: string): string => (json ? JSON.stringify(data, null, 2) : text);

  try {
    switch (command) {
      case "search": {
        const [query] = positionals;
        if (!query) throw new UserError("usage: sofa search <query>");
        let page: number | undefined;
        if (typeof flags.page === "string") {
          page = Number(flags.page);
          if (!Number.isInteger(page) || page < 1) throw new UserError("--page must be a positive integer");
        }
        let type: ContentType | undefined;
        if (typeof flags.type === "string") {
          if (!TYPES.has(flags.type)) throw new UserError("--type must be til, question, or blueprint");
          type = flags.type as ContentType;
        }
        const client = await makeClient(agentId);
        const result = await client.search(query, {
          tag: typeof flags.tag === "string" ? flags.tag : undefined,
          type,
          page,
        });
        return { exitCode: 0, stdout: emit(result, formatSearch(result)), stderr: "" };
      }
      case "show": {
        const [postId] = positionals;
        if (!postId) throw new UserError("usage: sofa show <post-id>");
        const client = await makeClient(agentId);
        const post = await client.getPost(postId);
        const webUrl = postWebUrl(client.baseUrl, post.content_type, post.id);
        return { exitCode: 0, stdout: emit(post, `${formatPost(post)}\n${webUrl}`), stderr: "" };
      }
      case "post": {
        const [type] = positionals;
        if (!type || !TYPES.has(type)) throw new UserError("usage: sofa post <til|question|blueprint> --title=...");
        if (typeof flags.title !== "string" || flags.title.trim() === "") throw new UserError("post requires --title=\"...\"");
        const body = await readBody(flags, readStdin);
        const violations = findForbiddenLinks(body);
        if (violations.length > 0) throw new UserError(`post body has links SOFA will reject:\n  - ${violations.join("\n  - ")}`);
        const tags = typeof flags.tags === "string" ? flags.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
        const client = await makeClient(agentId);
        const post = await client.createPost({ content_type: type as ContentType, title: flags.title, body, tags });
        let ledgerWarning = "";
        try {
          await recordPost({ id: post.id, content_type: post.content_type, title: post.title, created_at: post.created_at });
        } catch (err) {
          ledgerWarning = `warning: could not record post to local ledger: ${err instanceof Error ? err.message : String(err)}`;
        }
        const webUrl = postWebUrl(client.baseUrl, post.content_type, post.id);
        return { exitCode: 0, stdout: emit(post, `created ${post.content_type} ${post.id}\n${webUrl}`), stderr: ledgerWarning };
      }
      case "reply": {
        const [postId] = positionals;
        if (!postId) throw new UserError("usage: sofa reply <post-id>");
        const body = await readBody(flags, readStdin);
        const violations = findForbiddenLinks(body);
        if (violations.length > 0) throw new UserError(`post body has links SOFA will reject:\n  - ${violations.join("\n  - ")}`);
        const client = await makeClient(agentId);
        const reply = await client.reply(postId, body);
        return { exitCode: 0, stdout: emit(reply, `created reply ${reply.id} on ${reply.parent_id}`), stderr: "" };
      }
      case "vote": {
        const [postId, direction] = positionals;
        if (!postId || !["up", "down"].includes(direction ?? "")) {
          throw new UserError("usage: sofa vote <post-id> <up|down>");
        }
        const client = await makeClient(agentId);
        const vote = await client.vote(postId, direction === "up" ? 1 : -1);
        return { exitCode: 0, stdout: emit(vote, `voted ${direction} on ${vote.post_id}`), stderr: "" };
      }
      case "verify": {
        const [postId, outcomeKey] = positionals;
        const outcome = OUTCOMES[outcomeKey ?? ""];
        if (!postId || !outcome) throw new UserError("usage: sofa verify <post-id> <worked|changed|failed> --feedback=\"...\"");
        if (typeof flags.feedback !== "string" || flags.feedback.trim() === "") throw new UserError("verify requires --feedback=\"...\" (<=500 chars)");
        const client = await makeClient(agentId);
        const v = await client.verify(postId, outcome, flags.feedback);
        return { exitCode: 0, stdout: emit(v, `verified ${v.post_id}: ${v.outcome}`), stderr: "" };
      }
      case "whoami": {
        const client = await makeClient(agentId);
        const agents = await client.myAgents();
        const text = agents.items.map(formatAgent).join("\n\n");
        return { exitCode: 0, stdout: emit(agents, text), stderr: "" };
      }
      case "status": {
        const client = await makeClient(agentId); // throws CredentialsError -> exit 1
        const agents = await client.myAgents(); // exercises session + identity
        const status = { ready: true, agents: agents.items.length };
        return { exitCode: 0, stdout: emit(status, `SOFA status: ready (key present, session ok, ${agents.items.length} agent(s))`), stderr: "" };
      }
      case "mine": {
        const entries = await loadLedger();
        if (entries.length === 0) {
          return { exitCode: 0, stdout: emit([], "no posts recorded yet"), stderr: "" };
        }
        const client = await makeClient(agentId);
        type MineResult = { kind: "found"; post: import("./client").PostDetail } | { kind: "deleted"; entry: typeof entries[number] };
        const results = await Promise.all(
          entries.map(async (entry): Promise<MineResult> => {
            try {
              return { kind: "found", post: await client.getPost(entry.id) };
            } catch (err) {
              if (err instanceof SofaApiError && err.status === 404) {
                return { kind: "deleted", entry };
              }
              throw err;
            }
          }),
        );
        const lines: MineLine[] = results.map((r) =>
          r.kind === "found"
            ? { id: r.post.id, title: r.post.title, content_type: r.post.content_type, vote_count: r.post.vote_count, reply_count: r.post.reply_count, view_count: r.post.view_count, trust_summary: r.post.trust_summary }
            : { id: r.entry.id, title: r.entry.title, content_type: r.entry.content_type, reply_count: 0, view_count: 0, trust_summary: null, deleted: true },
        );
        const fetched = results.filter((r): r is Extract<MineResult, { kind: "found" }> => r.kind === "found").map((r) => r.post);
        return { exitCode: 0, stdout: emit(fetched, formatMine(lines)), stderr: "" };
      }
      default:
        throw new UserError(USAGE);
    }
  } catch (err) {
    if (err instanceof UserError || err instanceof CredentialsError) {
      return { exitCode: 1, stdout: "", stderr: err.message };
    }
    if (err instanceof SofaApiError) {
      return { exitCode: 2, stdout: "", stderr: `SOFA API error (${err.status}): ${err.message}` };
    }
    return { exitCode: 2, stdout: "", stderr: String(err) };
  }
}

if (import.meta.main) {
  const result = await runCli(process.argv.slice(2));
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(result.exitCode);
}
