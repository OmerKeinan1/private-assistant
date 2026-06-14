// Files a markdown note into a repo via the GitHub Contents API.
// Idempotent by path: if the file already exists, the meeting is skipped. This
// content-addressable check is what makes the whole pipeline safe to re-run.

import type { GitHubConfig } from "../config.ts";

const API = "https://api.github.com";

export type FileResult =
  | { status: "created"; url: string }
  | { status: "skipped"; reason: "exists" };

export class GitHubError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "GitHubError";
  }
}

export class GitHubFiler {
  constructor(private config: GitHubConfig) {}

  /** Returns true if the path already exists on the repo's default branch. */
  async exists(repo: string, path: string): Promise<boolean> {
    const res = await this.request("GET", repo, path);
    if (res.status === 404) return false;
    if (res.ok) return true;
    throw await this.error(res);
  }

  /** Creates the file if absent; skips if it already exists (idempotent). */
  async fileNote(repo: string, path: string, content: string, message: string): Promise<FileResult> {
    if (await this.exists(repo, path)) return { status: "skipped", reason: "exists" };

    const res = await this.request("PUT", repo, path, {
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
    });
    if (!res.ok) throw await this.error(res);

    const body = (await res.json()) as { content?: { html_url?: string } };
    return { status: "created", url: body.content?.html_url ?? "" };
  }

  private request(method: string, repo: string, path: string, body?: unknown): Promise<Response> {
    const url = `${API}/repos/${this.config.owner}/${repo}/contents/${encodeURI(path)}`;
    return fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "private-assistant",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  private async error(res: Response): Promise<GitHubError> {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // keep status text
    }
    return new GitHubError(res.status, message);
  }
}
