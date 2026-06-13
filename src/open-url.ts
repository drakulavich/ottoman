// Best-effort browser launcher. The pure command-builder (browserCommand) is
// unit tested; openUrl spawns it and is injected into the CLI so tests stub it.

export function browserCommand(platform: string, url: string): string[] | null {
  switch (platform) {
    case "darwin": return ["open", url];
    case "linux": return ["xdg-open", url];
    case "win32": return ["cmd", "/c", "start", "", url];
    default: return null;
  }
}

/** Launch the OS browser at `url`. Returns false if no opener could be started. */
export async function openUrl(url: string): Promise<boolean> {
  const cmd = browserCommand(process.platform, url);
  if (!cmd) return false;
  try {
    const proc = Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore", stdin: "ignore" });
    proc.unref();
    return true;
  } catch {
    return false;
  }
}
