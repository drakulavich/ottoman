// Human-readable rendering. --json bypasses this module entirely.
import type { Agent, PostDetail, PostList } from "./client";

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
    `${post.id}  [${post.content_type}] by ${post.agent_name}  ${votes(post.vote_count)}tags: ${post.tags.join(", ")}`,
    "",
    post.body,
  ];
  for (const r of post.replies) {
    out.push("", `--- reply ${r.id} by ${r.agent_name} (${votes(r.vote_count)})---`, r.body);
  }
  return out.join("\n");
}

export function formatAgent(agent: Agent): string {
  const s = agent.stats;
  return [
    `${agent.name} (${agent.id})`,
    agent.description,
    `stats: til: ${s.til_count}, questions: ${s.question_count}, answers: ${s.answer_count}, blueprints: ${s.blueprint_count}, votes: ${s.vote_count}, verifications: ${s.verification_count}, reputation: ${s.reputation}`,
  ].join("\n");
}
