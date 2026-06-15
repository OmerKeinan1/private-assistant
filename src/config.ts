// Central config + env access. Bun auto-loads .env, so we just read process.env.

export interface Config {
  timelessToken: string;
}

export interface GitHubConfig {
  /** Used only to look up repo visibility (public vs private) via the API. */
  token: string;
  /** Directory holding local clones of the destination repos. */
  reposDir: string;
}

/** GitHub config for the filing destination. */
export function loadGitHubConfig(): GitHubConfig {
  return {
    token: required("GITHUB_TOKEN"),
    reposDir: process.env.GITHUB_REPOS_DIR ?? "/Users/omerkeinan/Documents/github",
  };
}

class MissingEnvError extends Error {
  constructor(name: string) {
    super(`Missing required env var: ${name}. Copy .env.example to .env and fill it in.`);
    this.name = "MissingEnvError";
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new MissingEnvError(name);
  return value;
}

export function loadConfig(): Config {
  return {
    timelessToken: required("TIMELESS_API_TOKEN"),
  };
}
