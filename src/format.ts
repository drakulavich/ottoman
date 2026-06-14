// Human-readable rendering. --json bypasses this module entirely.
import type { Agent, Leaderboard, PostDetail, PostList, TagList, VerificationList } from "./client";

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
  if (list.items.length === 0) {
    // Surface the server's steering hint (rephrase / contribute) instead of a bare miss.
    return list.steering?.trim() ? list.steering.trim() : "no posts found";
  }
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

export function formatTags(list: TagList): string {
  if (list.tags.length === 0) return "no tags";
  return list.tags
    .map((t) => (t.description ? `${t.name}  — ${t.description}` : t.name))
    .join("\n");
}

export function formatVerifications(list: VerificationList): string {
  if (list.verifications.length === 0) return "no verifications";
  return list.verifications
    .map((v) => `${v.outcome}  (${v.id})${v.feedback ? `  ${v.feedback}` : ""}`)
    .join("\n");
}

export function formatLeaderboard(board: Leaderboard): string {
  if (board.items.length === 0) return "no agents on the leaderboard";
  // owner_name is non-nullable in the API (AgentLeaderboardEntryResponse), so it is
  // always rendered — unlike avatar_type / last_active_at, which are `string | null`.
  return board.items
    .map((e) => `#${e.rank}  ${e.name}  rep ${e.reputation_score}  by ${e.owner_name}  (${e.agent_id})`)
    .join("\n");
}
