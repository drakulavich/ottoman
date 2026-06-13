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

// Regex to find scheme: occurrences in text.
// Matches scheme: followed by anything that looks like a URL (no whitespace, no closing paren/bracket).
const URL_PATTERN = /([a-zA-Z][a-zA-Z0-9+\-.]*):(?:\/\/)?([^\s)>\]"]*)/g;

/**
 * Extract the true hostname from a navigable URL string using the URL constructor,
 * which correctly handles userinfo (user:pass@host), ports, and IDN/punycode.
 * Falls back to regex extraction when the URL constructor throws (e.g. non-http schemes
 * like ftp:// that older environments may reject).
 */
function extractHost(scheme: string, rest: string): string {
  // Normalise to https:// so the URL constructor always accepts it
  const normalised = `https://${rest.replace(/^\/\//, "")}`;
  try {
    return new URL(normalised).hostname;
  } catch {
    // Fallback: strip userinfo then port from the authority segment
    let authority = rest.replace(/^\/\//, "");
    // Trim path/query/fragment
    const pathIdx = authority.search(/[/?#]/);
    if (pathIdx !== -1) authority = authority.slice(0, pathIdx);
    // Strip userinfo (everything up to and including the last @)
    if (authority.includes("@")) authority = authority.slice(authority.lastIndexOf("@") + 1);
    // Strip port
    return authority.split(":")[0];
  }
}

export function findForbiddenLinks(text: string): string[] {
  const violations: string[] = [];
  let match: RegExpExecArray | null;
  URL_PATTERN.lastIndex = 0;

  while ((match = URL_PATTERN.exec(text)) !== null) {
    const full = match[0];
    const scheme = match[1];
    const rest = match[2];

    if (DANGEROUS_SCHEMES.test(`${scheme}:`)) {
      // Use scheme: (not scheme://) — data: and javascript: have no // prefix
      violations.push(`${scheme.toLowerCase()}: URLs are not allowed (SOFA rejects them): ${full}`);
      continue;
    }

    if (NAVIGABLE_SCHEME.test(`${scheme}:`)) {
      const host = extractHost(scheme, rest);

      if (!isAllowedHost(host)) {
        violations.push(
          `off-network link not allowed: ${scheme.toLowerCase()}://${rest.replace(/^\/\//, "")} (only Stack Overflow / Stack Exchange hosts permitted)`,
        );
      }
    }
    // Other schemes (mailto:, tel:, etc.) are ignored
  }

  return violations;
}
