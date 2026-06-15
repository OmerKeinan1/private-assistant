// Deterministic routing: match a meeting's fields to a destination repo.
// First matching rule wins; an unmatched meeting goes to the Drive fallback.
// No tokens, no network: pure logic over the meeting object.

import type { Meeting } from "../sources/timeless.ts";

export interface RuleMatch {
  /** Case-insensitive substring against any participant's company. */
  company?: string;
  /** Case-insensitive substring against any participant's name or email. */
  participant?: string;
  /** Regex against the meeting title; matched case-insensitively. */
  titleRegex?: string;
}

export interface RepoTarget {
  repo: string;
  folder?: string;
}

export interface RepoRule extends RepoTarget {
  match: RuleMatch;
}

export interface RoutesConfig {
  rules: RepoRule[];
  /** Where meetings that match no rule go (a private catch-all repo). */
  fallback: RepoTarget;
}

/** A meeting always resolves to a repo: a matching rule, or the fallback. */
export interface Destination {
  repo: string;
  folder: string;
  /** The rule's match conditions, or null when the fallback was used. */
  matchedBy: RuleMatch | null;
}

const DEFAULT_FOLDER = "meetings";

export class RoutesConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutesConfigError";
  }
}

/** Loads and validates the routing config, compiling regexes eagerly so a bad
 *  pattern fails at startup rather than mid-run. */
export async function loadRoutes(path = "config/routes.json"): Promise<RoutesConfig> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new RoutesConfigError(
      `No routing config at ${path}. Copy config/routes.example.json to ${path} and edit it.`,
    );
  }

  let raw: unknown;
  try {
    raw = await file.json();
  } catch {
    throw new RoutesConfigError(`${path} is not valid JSON.`);
  }

  const config = raw as Partial<RoutesConfig>;
  if (!Array.isArray(config.rules)) {
    throw new RoutesConfigError(`${path}: "rules" must be an array.`);
  }
  if (!config.fallback?.repo) {
    throw new RoutesConfigError(`${path}: "fallback" must be { "repo": "...", "folder": "..." }.`);
  }

  for (const [i, rule] of config.rules.entries()) {
    if (!rule.repo) throw new RoutesConfigError(`${path}: rule ${i} is missing "repo".`);
    if (rule.match?.titleRegex) {
      try {
        compileTitleRegex(rule.match.titleRegex);
      } catch (err) {
        throw new RoutesConfigError(
          `${path}: rule ${i} has an invalid titleRegex: ${(err as Error).message}`,
        );
      }
    }
  }

  return config as RoutesConfig;
}

/** Compiles a titleRegex as case-insensitive, tolerating a leading (?i) that
 *  users may carry over from other regex flavors (JS rejects inline flags). */
function compileTitleRegex(pattern: string): RegExp {
  const stripped = pattern.replace(/^\(\?i\)/, "");
  return new RegExp(stripped, "i");
}

function matchesRule(meeting: Meeting, match: RuleMatch): boolean {
  const participants = meeting.participants ?? [];

  if (match.company) {
    const needle = match.company.toLowerCase();
    const hit = participants.some((p) => p.company?.toLowerCase().includes(needle));
    if (!hit) return false;
  }

  if (match.participant) {
    const needle = match.participant.toLowerCase();
    const hit = participants.some(
      (p) =>
        p.name?.toLowerCase().includes(needle) || p.email?.toLowerCase().includes(needle),
    );
    if (!hit) return false;
  }

  if (match.titleRegex) {
    if (!compileTitleRegex(match.titleRegex).test(meeting.title)) return false;
  }

  return true;
}

/** Resolves a meeting to its destination repo. First matching rule wins; an
 *  unmatched meeting goes to the fallback catch-all repo. */
export function route(meeting: Meeting, config: RoutesConfig): Destination {
  for (const rule of config.rules) {
    if (matchesRule(meeting, rule.match)) {
      return { repo: rule.repo, folder: rule.folder ?? DEFAULT_FOLDER, matchedBy: rule.match };
    }
  }
  return {
    repo: config.fallback.repo,
    folder: config.fallback.folder ?? DEFAULT_FOLDER,
    matchedBy: null,
  };
}
