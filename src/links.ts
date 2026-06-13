// Pure client-side link preflight — no fs, no env reads.
// Checks post/reply body text for URLs that SOFA will reject.

// Allowed SO/SE network hosts (case-insensitive). Subdomains are also allowed.
const ALLOWED_HOSTS = [
  "agents.stackoverflow.com",
  "stackoverflow.com",
  "stackexchange.com",
  "serverfault.com",
  "superuser.com",
  "askubuntu.com",
  "stackapps.com",
  "mathoverflow.net",
];

/** Returns true if the given hostname is in the SO/SE allowlist (exact or subdomain). */
function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase();
  for (const allowed of ALLOWED_HOSTS) {
    if (h === allowed || h.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

// Dangerous non-navigable schemes that are always rejected regardless of host.
const DANGEROUS_SCHEMES = /^(file|data|javascript):/i;

// Navigable URL schemes that require an allowlist check.
const NAVIGABLE_SCHEME = /^(https?|ftps?|sftp|wss?):/i;

// Regex to find scheme:// or scheme: occurrences in text.
// Matches scheme: followed by anything that looks like a URL (no whitespace, no closing paren/bracket).
const URL_PATTERN = /([a-zA-Z][a-zA-Z0-9+\-.]*):(?:\/\/)?([^\s)>\]"]*)/g;

export function findForbiddenLinks(text: string): string[] {
  const violations: string[] = [];
  let match: RegExpExecArray | null;
  URL_PATTERN.lastIndex = 0;

  while ((match = URL_PATTERN.exec(text)) !== null) {
    const full = match[0];
    const scheme = match[1];
    const rest = match[2];

    // Skip scheme-less bare words (e.g. "requirements.txt" — no colon)
    // URL_PATTERN requires a colon, so we only get here for real scheme: matches.

    if (DANGEROUS_SCHEMES.test(`${scheme}:`)) {
      violations.push(`${scheme.toLowerCase()}:// URLs are not allowed (SOFA rejects them): ${full}`);
      continue;
    }

    if (NAVIGABLE_SCHEME.test(`${scheme}:`)) {
      // Extract host from rest (rest starts after scheme:// or scheme:)
      // For scheme://host/path, rest = //host/path or host/path
      let hostPart = rest.replace(/^\/\//, "");
      // Take up to the first / or end
      const slashIdx = hostPart.indexOf("/");
      const host = slashIdx === -1 ? hostPart : hostPart.slice(0, slashIdx);
      // Remove port if present
      const bareHost = host.split(":")[0];

      if (!isAllowedHost(bareHost)) {
        violations.push(
          `off-network link not allowed: ${scheme.toLowerCase()}://${rest.replace(/^\/\//, "")} (only Stack Overflow / Stack Exchange hosts permitted)`,
        );
      }
    }
    // Other schemes (mailto:, tel:, etc.) are ignored
  }

  return violations;
}
