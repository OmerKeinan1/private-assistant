#!/usr/bin/env bun
// private-assistant CLI entry point.
//
//   pa pull --dry-run   route + assemble notes, write nothing (read-only preview)
//   pa pull             route, assemble, and file notes into the matched repos

import { loadConfig, loadGitHubConfig } from "./config.ts";
import { TimelessClient, TimelessError, type Meeting } from "./sources/timeless.ts";
import { loadRoutes, RoutesConfigError, type RoutesConfig } from "./router/rules.ts";
import { GitHubFiler, GitHubError } from "./destinations/github.ts";
import { runPipeline, type Outcome } from "./pipeline.ts";

const USAGE = `private-assistant (pa)

Usage:
  pa pull [options]      Pull, route, and file recent completed meetings

Options:
  --days <n>     Lookback window in days (default: 3)
  --dry-run      Route and assemble notes, but write nothing
  --full         In dry-run, print the full assembled note (not just a preview)
  -h, --help     Show this help
`;

/** YYYY-MM-DD for `now - days`, the start_date lower bound for the poll window. */
function lookbackDate(days: number): string {
  const ms = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function meetingLine(m: Meeting): string {
  const companies = [
    ...new Set((m.participants ?? []).map((p) => p.company).filter(Boolean)),
  ].join(", ");
  const people = `${m.participants?.length ?? 0} participant(s)${companies ? ` [${companies}]` : ""}`;
  return `  ${m.start_time.slice(0, 10)}  ${m.title}\n      ${people}`;
}

function indent(text: string, by = "      "): string {
  return text
    .split("\n")
    .map((l) => by + l)
    .join("\n");
}

function printOutcome(o: Outcome, full: boolean): void {
  console.log(meetingLine(o.meeting));
  switch (o.kind) {
    case "drive":
      console.log(`      → Drive: ${o.folder} (fallback; not implemented yet)`);
      break;
    case "preview": {
      const lines = o.note.split("\n");
      console.log(`      → ${o.repo}/${o.path}  [preview, ${lines.length} lines]`);
      const shown = full ? o.note : lines.slice(0, 12).join("\n");
      console.log(indent(shown));
      if (!full && lines.length > 12) console.log(`      … (${lines.length - 12} more lines; --full to see all)`);
      break;
    }
    case "filed": {
      const tag =
        o.result.status === "created" ? `filed → ${o.result.url}` : "skipped (already filed)";
      console.log(`      → ${o.repo}/${o.path}  ${tag}`);
      break;
    }
  }
}

async function pull(args: string[]): Promise<void> {
  const days = Number(valueOf(args, "--days") ?? 3);
  const dryRun = args.includes("--dry-run");
  const full = args.includes("--full");

  const config = loadConfig();
  const timeless = new TimelessClient(config.timelessToken);

  let routes: RoutesConfig | null = null;
  try {
    routes = await loadRoutes();
  } catch (err) {
    if (!(err instanceof RoutesConfigError)) throw err;
    console.warn(`No routing config: ${err.message}\n`);
  }

  const filer = dryRun ? null : new GitHubFiler(loadGitHubConfig());

  const since = lookbackDate(days);
  console.log(`Pulling completed meetings since ${since}${dryRun ? " (dry-run)" : ""}...`);

  const meetings = await timeless.listMeetings({
    status: "completed",
    start_date: since,
    expand: ["documents"],
  });

  if (meetings.length === 0) {
    console.log("No completed meetings in the window.");
    return;
  }

  console.log(`\nFound ${meetings.length} meeting(s):\n`);

  if (!routes) {
    for (const m of meetings) console.log(meetingLine(m));
    console.log(`\nAdd config/routes.json to route and file these.`);
    return;
  }

  const outcomes = await runPipeline(meetings, { timeless, routes, filer, dryRun });
  for (const o of outcomes) printOutcome(o, full);

  const filed = outcomes.filter((o) => o.kind === "filed" && o.result.status === "created").length;
  const skipped = outcomes.filter((o) => o.kind === "filed" && o.result.status === "skipped").length;
  const drive = outcomes.filter((o) => o.kind === "drive").length;
  console.log(
    dryRun
      ? `\n(dry-run) ${outcomes.length} meeting(s) processed; nothing written.`
      : `\nDone: ${filed} filed, ${skipped} already present, ${drive} unrouted (Drive).`,
  );
}

/** Reads the value following a `--flag` in argv, or undefined. */
function valueOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "-h" || command === "--help") {
    console.log(USAGE);
    return;
  }

  try {
    switch (command) {
      case "pull":
        await pull(args);
        break;
      default:
        console.error(`Unknown command: ${command}\n`);
        console.log(USAGE);
        process.exit(1);
    }
  } catch (err) {
    if (err instanceof TimelessError) {
      console.error(`Timeless API error (${err.status} ${err.code}): ${err.message}`);
    } else if (err instanceof GitHubError) {
      console.error(`GitHub API error (${err.status}): ${err.message}`);
    } else {
      console.error(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }
}

await main();
