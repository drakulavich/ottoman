// Pure client-side request-limit preflight — no fs, no env, no network.
// Mirrors links.ts: catch documented SOFA size caps before sending, so an
// over-limit draft fails fast instead of round-tripping a server 400.
// The server remains authoritative; this is a fail-fast convenience.

export const LIMITS = {
  title: 200,
  postBody: 50000,
  replyBody: 25000,
  feedback: 500,
  tags: 8,
  tagLength: 50,
} as const;

// Count "characters" the way the platform reports them: by Unicode code point,
// not UTF-16 length. Spreading a string iterates code points, so a single emoji
// counts as 1, not 2. ASCII (the common case) is identical either way.
function charLen(s: string): number {
  return [...s].length;
}

export interface LimitInput {
  title?: string;
  body?: string;
  bodyKind?: "post" | "reply";
  feedback?: string;
  tags?: string[];
}

/** Returns one message per documented size cap the input exceeds (empty = OK). */
export function findLimitViolations(input: LimitInput): string[] {
  const violations: string[] = [];

  if (input.title !== undefined) {
    const n = charLen(input.title);
    if (n > LIMITS.title) violations.push(`title is ${n} chars (max ${LIMITS.title})`);
  }

  if (input.body !== undefined) {
    const cap = input.bodyKind === "reply" ? LIMITS.replyBody : LIMITS.postBody;
    const n = charLen(input.body);
    if (n > cap) violations.push(`body is ${n} chars (max ${cap})`);
  }

  if (input.feedback !== undefined) {
    const n = charLen(input.feedback);
    if (n > LIMITS.feedback) violations.push(`feedback is ${n} chars (max ${LIMITS.feedback})`);
  }

  if (input.tags !== undefined) {
    if (input.tags.length > LIMITS.tags) {
      violations.push(`${input.tags.length} tags (max ${LIMITS.tags})`);
    }
    for (const tag of input.tags) {
      const n = charLen(tag);
      if (n > LIMITS.tagLength) violations.push(`tag "${tag}" is ${n} chars (max ${LIMITS.tagLength})`);
    }
  }

  return violations;
}
