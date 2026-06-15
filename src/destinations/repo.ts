// Files a markdown note into a repo's LOCAL clone.
//
//   private repo -> commit the note (path-scoped) and push
//   public repo  -> write the note into a gitignored folder; never committed/pushed
//
// Idempotent by path: if the note file already exists on disk, the meeting is
// skipped, so re-runs are safe at any interval.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GitHubConfig } from "../config.ts";

export type Visibility = "public" | "private";

export type FileResult =
  | { status: "pushed"; path: string } // private: committed + pushed
  | { status: "local"; path: string } // public: written to gitignored folder, not published
  | { status: "skipped"; reason: "exists" };

export class RepoFilingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepoFilingError";
  }
}

export class RepoFiler {
  private visibilityCache = new Map<string, Visibility>();

  constructor(private config: GitHubConfig) {}

  private repoRoot(repo: string): string {
    return join(this.config.reposDir, repo);
  }

  hasClone(repo: string): boolean {
    return existsSync(join(this.repoRoot(repo), ".git"));
  }

  /** True if the note already exists in the local clone. */
  exists(repo: string, relPath: string): boolean {
    return existsSync(join(this.repoRoot(repo), relPath));
  }

  /** Repo visibility via the GitHub API; memoized per run. */
  async visibility(repo: string): Promise<Visibility> {
    const cached = this.visibilityCache.get(repo);
    if (cached) return cached;

    const res = await fetch(`https://api.github.com/repos/${this.config.owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "private-assistant",
      },
    });
    if (!res.ok) {
      throw new RepoFilingError(`Could not read visibility of ${repo} (HTTP ${res.status}).`);
    }
    const body = (await res.json()) as { private: boolean };
    const visibility: Visibility = body.private ? "private" : "public";
    this.visibilityCache.set(repo, visibility);
    return visibility;
  }

  async fileNote(repo: string, relPath: string, content: string, message: string): Promise<FileResult> {
    const root = this.repoRoot(repo);
    if (!this.hasClone(repo)) {
      throw new RepoFilingError(
        `No local clone of ${repo} at ${root}. Clone it (or set GITHUB_REPOS_DIR) first.`,
      );
    }
    if (this.exists(repo, relPath)) return { status: "skipped", reason: "exists" };

    const visibility = await this.visibility(repo);
    const target = join(root, relPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");

    const folder = relPath.split("/")[0] ?? "meetings";

    if (visibility === "public") {
      // Public repo: keep the note local-only. Ensure the folder is ignored so it
      // can never be committed/pushed by this tool or anyone working in the repo.
      await ensureGitignored(root, `${folder}/`);
      return { status: "local", path: relPath };
    }

    // Private repo: commit just this path (other staged changes are untouched) and push.
    git(root, ["add", "--", relPath]);
    git(root, ["commit", "-m", message, "--", relPath]);
    pushWithSync(root);
    return { status: "pushed", path: relPath };
  }
}

interface GitResult {
  ok: boolean;
  stderr: string;
}

function runGit(cwd: string, args: string[]): GitResult {
  const res = Bun.spawnSync(["git", "-C", cwd, ...args]);
  return { ok: res.exitCode === 0, stderr: res.stderr.toString().trim() };
}

function git(cwd: string, args: string[]): void {
  const res = runGit(cwd, args);
  if (!res.ok) throw new RepoFilingError(`git ${args.join(" ")} failed: ${res.stderr}`);
}

/** Pushes; if the remote has moved on, rebases our note commit on top and retries.
 *  --autostash protects any unrelated uncommitted work in the clone. */
function pushWithSync(cwd: string): void {
  const first = runGit(cwd, ["push"]);
  if (first.ok) return;

  const rejected = /\b(rejected|fetch first|non-fast-forward)\b/i.test(first.stderr);
  if (!rejected) throw new RepoFilingError(`git push failed: ${first.stderr}`);

  const sync = runGit(cwd, ["pull", "--rebase", "--autostash"]);
  if (!sync.ok) {
    runGit(cwd, ["rebase", "--abort"]); // best-effort cleanup
    throw new RepoFilingError(
      `note committed locally but the remote had changes that could not be auto-merged; ` +
        `resolve and push manually. (${sync.stderr})`,
    );
  }

  const retry = runGit(cwd, ["push"]);
  if (!retry.ok) throw new RepoFilingError(`git push failed after sync: ${retry.stderr}`);
}

/** Appends `entry` to the repo's .gitignore if it is not already present. */
async function ensureGitignored(root: string, entry: string): Promise<void> {
  const path = join(root, ".gitignore");
  let current = "";
  if (existsSync(path)) current = await readFile(path, "utf8");

  const lines = current.split("\n").map((l) => l.trim());
  if (lines.includes(entry) || lines.includes(entry.replace(/\/$/, ""))) return;

  const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  await writeFile(path, `${current}${prefix}${entry}\n`, "utf8");
}
