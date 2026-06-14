// Central config + env access. Bun auto-loads .env, so we just read process.env.

export interface Config {
  timelessToken: string;
}

export interface GitHubConfig {
  token: string;
  owner: string;
}

/** GitHub config for the filing destination. Required only when actually filing. */
export function loadGitHubConfig(): GitHubConfig {
  return {
    token: required("GITHUB_TOKEN"),
    owner: process.env.GITHUB_OWNER ?? "OmerKeinan1",
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
