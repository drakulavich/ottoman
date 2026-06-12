// Behavioral smoke tests for the bash completion script — `bash -n` only
// proves it parses. These drive _sofa() in a real bash and assert COMPREPLY.
// zsh/fish completion engines can't be driven headlessly this way; their files
// are syntax-checked in CI instead.
import { describe, expect, it } from "bun:test";

async function complete(words: string[], cword: number): Promise<string[]> {
  const script = `
    source completions/sofa.bash
    COMP_WORDS=(${words.map((w) => `'${w}'`).join(" ")})
    COMP_CWORD=${cword}
    COMP_LINE='${words.join(" ")}'
    COMP_POINT=\${#COMP_LINE}
    _sofa
    printf '%s\\n' "\${COMPREPLY[@]}"
  `;
  const proc = Bun.spawn(["bash", "-c", script], {
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out.split("\n").filter(Boolean);
}

describe("completion files stay in sync with the CLI surface", () => {
  // Drift guard: every command in src/cli.ts USAGE must appear in all three
  // completion files. Catches "added a command, forgot the completions".
  it("every USAGE command appears in each completion file", async () => {
    const root = new URL("..", import.meta.url).pathname;
    const cli = await Bun.file(`${root}/src/cli.ts`).text();
    const usage = cli.match(/const USAGE = `([\s\S]*?)`/)?.[1] ?? "";
    const commands = [...usage.matchAll(/^ {2}(\w[\w-]*)/gm)].map((m) => m[1]);
    expect(commands.length).toBeGreaterThanOrEqual(8);
    for (const file of ["completions/sofa.bash", "completions/_sofa", "completions/sofa.fish"]) {
      const text = await Bun.file(`${root}/${file}`).text();
      for (const cmd of commands) {
        expect(text, `${file} is missing command '${cmd}'`).toContain(cmd);
      }
    }
  });
});

describe("bash completion", () => {
  it("completes command names at position 1", async () => {
    const replies = await complete(["sofa", "s"], 1);
    expect(replies).toContain("search");
    expect(replies).toContain("show");
    expect(replies).toContain("status");
    expect(replies).not.toContain("vote");
  });

  it("completes post content types at position 2", async () => {
    const replies = await complete(["sofa", "post", "b"], 2);
    expect(replies).toEqual(["blueprint"]);
  });

  it("completes vote direction at position 3", async () => {
    const replies = await complete(["sofa", "vote", "p-1", "d"], 3);
    expect(replies).toEqual(["down"]);
  });

  it("completes verify outcomes at position 3", async () => {
    const replies = await complete(["sofa", "verify", "p-1", ""], 3);
    expect(replies.sort()).toEqual(["changed", "failed", "worked"]);
  });

  it("completes search flags", async () => {
    const replies = await complete(["sofa", "search", "query", "--t"], 3);
    expect(replies).toContain("--tag=");
    expect(replies).toContain("--type=");
    expect(replies).not.toContain("--feedback=");
  });
});
