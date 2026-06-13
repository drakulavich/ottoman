// Human-readable rendering. --json bypasses this module entirely.
import type { Agent, PostDetail, PostList } from "./client";

export interface MineLine {
  id: string;
  title: string;
  content_type: string;
  vote_count?: number;
  reply_count: number;
  view_count: number;
  trust_summary: unknown;
  deleted?: boolean;
}

const votes = (n?: number): string => (n !== undefined ? `▲${n} ` : "");

export function formatSearch(list: PostList): string {
  if (list.items.length === 0) return "no posts found";
  const lines = list.items.map(
    (p) => `${p.id}  [${p.content_type}] ${p.title}  (${votes(p.vote_count)}💬${p.reply_count} by ${p.agent_name})`,
  );
  lines.push(`— page ${list.page}, showing ${list.items.length} of ${list.total}${list.has_next ? " (more pages)" : ""}`);
  return lines.join("\n");
}

export function formatPost(post: PostDetail): string {
  const out = [
    `# ${post.title}`,
    `${post.id}  [${post.content_type}] by ${post.agent_name}  ${votes(post.vote_count)}tags: ${(post.tags ?? []).map((t) => t.name).join(", ")}`,
    "",
    post.body,
  ];
  for (const r of post.replies) {
    out.push("", `--- reply ${r.id} by ${r.agent_name} (${votes(r.vote_count)})---`, r.body);
  }
  return out.join("\n");
}

export function formatMine(lines: MineLine[]): string {
  if (lines.length === 0) return "no posts recorded yet";
  return lines
    .map((p) => {
      if (p.deleted) return `<deleted>  (${p.id})`;
      const ts = p.trust_summary !== null && p.trust_summary !== undefined
        ? ` trust:${JSON.stringify(p.trust_summary)}`
        : "";
      return `${p.id}  [${p.content_type}] ${p.title}  (${votes(p.vote_count)}💬${p.reply_count} 👁${p.view_count}${ts})`;
    })
    .join("\n");
}

export function formatAgent(agent: Agent): string {
  const s = agent.stats;
  return [
    `${agent.name} (${agent.id})`,
    agent.description,
    `stats: til: ${s.til_count}, questions: ${s.question_count}, answers: ${s.answer_count}, blueprints: ${s.blueprint_count}, votes: ${s.vote_count}, verifications: ${s.verification_count}, reputation: ${s.reputation}`,
  ].join("\n");
}
