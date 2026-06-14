#!/usr/bin/env bun
// private-assistant CLI entry point.
//
// v0: `pull --dry-run` authenticates against Timeless and lists recent
// completed meetings. Routing and filing are not wired up yet.

import { loadConfig } from "./config.ts";
import { TimelessClient, TimelessError, type Meeting } from "./sources/timeless.ts";
import {
  loadRoutes,
  route,
  RoutesConfigError,
  type Destination,
  type RoutesConfig,
} from "./router/rules.ts";

const USAGE = `private-assistant (pa)

Usage:
  pa pull [options]      Pull recent completed meetings from Timeless

Options:
  --days <n>     Lookback window in days (default: 3)
  --dry-run      List what would be processed; do not file anything
  -h, --help     Show this help
`;

/** YYYY-MM-DD for `now - days`, the start_date lower bound for the poll window. */
function lookbackDate(days: number): string {
  const ms = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function describeDestination(dest: Destination): string {
  return dest.kind === "repo"
    ? `→ ${dest.repo}/${dest.folder}/`
    : `→ Drive: ${dest.folder} (fallback)`;
}

function formatMeeting(m: Meeting, routes: RoutesConfig | null): string {
  const date = m.start_time.slice(0, 10);
  const people = m.participants?.length ?? 0;
  const docs = m.documents?.length ?? 0;
  const companies = [
    ...new Set((m.participants ?? []).map((p) => p.company).filter(Boolean)),
  ].join(", ");
  const dest = routes ? `\n      ${describeDestination(route(m, routes))}` : "";
  return `  ${date}  ${m.id}\n      ${m.title}\n      ${people} participant(s)${companies ? ` [${companies}]` : ""}, ${docs} document(s)${dest}`;
}

async function pull(args: string[]): Promise<void> {
  const days = Number(valueOf(args, "--days") ?? 3);
  const dryRun = args.includes("--dry-run");

  const config = loadConfig();
  const timeless = new TimelessClient(config.timelessToken);

  let routes: RoutesConfig | null = null;
  try {
    routes = await loadRoutes();
  } catch (err) {
    if (err instanceof RoutesConfigError) {
      console.warn(`No routing applied: ${err.message}\n`);
    } else {
      throw err;
    }
  }

  const since = lookbackDate(days);
  console.log(`Pulling completed meetings since ${since}...`);

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
  for (const m of meetings) console.log(formatMeeting(m, routes));

  if (dryRun) {
    console.log(`\n(dry-run) Routing and filing are not implemented yet.`);
    return;
  }

  // Routing + filing land here next. Until then, pull is dry-run only.
  console.log(`\nRouting/filing not implemented yet; re-run with --dry-run.`);
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
    } else {
      console.error(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }
}

await main();
