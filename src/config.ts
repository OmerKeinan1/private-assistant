// Central config + env access. Bun auto-loads .env, so we just read process.env.

export interface Config {
  timelessToken: string;
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
