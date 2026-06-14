// Manages a launchd agent that runs `pa pull` on an interval. The plist is
// generated at install time from the current bun binary and working directory,
// so it points at wherever you install it from (e.g. the main checkout).

import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const LABEL = "com.omerkeinan.private-assistant";
const DEFAULT_INTERVAL = 900; // 15 minutes

function plistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
}

function logPaths(): { out: string; err: string } {
  const dir = join(homedir(), "Library", "Logs");
  return { out: join(dir, "private-assistant.log"), err: join(dir, "private-assistant.err.log") };
}

function buildPlist(bun: string, projectDir: string, interval: number): string {
  const { out, err } = logPaths();
  const entry = join(projectDir, "src", "index.ts");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bun}</string>
    <string>run</string>
    <string>${entry}</string>
    <string>pull</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${projectDir}</string>
  <key>StartInterval</key>
  <integer>${interval}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${out}</string>
  <key>StandardErrorPath</key>
  <string>${err}</string>
</dict>
</plist>
`;
}

function launchctl(args: string[]): { ok: boolean; stderr: string } {
  const res = Bun.spawnSync(["launchctl", ...args]);
  return { ok: res.exitCode === 0, stderr: res.stderr.toString().trim() };
}

export async function installSchedule(interval = DEFAULT_INTERVAL): Promise<void> {
  const bun = process.execPath;
  const projectDir = process.cwd();
  const path = plistPath();

  await mkdir(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
  await mkdir(join(homedir(), "Library", "Logs"), { recursive: true });
  await writeFile(path, buildPlist(bun, projectDir, interval), "utf8");

  // Reload if already loaded; ignore unload errors when it is not.
  launchctl(["unload", path]);
  const load = launchctl(["load", path]);
  if (!load.ok) throw new Error(`launchctl load failed: ${load.stderr}`);

  console.log(`Installed launchd agent ${LABEL}`);
  console.log(`  runs: ${bun} run ${join(projectDir, "src/index.ts")} pull`);
  console.log(`  every ${interval}s, working dir ${projectDir}`);
  console.log(`  logs: ${logPaths().out}`);
  console.log(`\nEnsure ${projectDir} has a .env and config/routes.json.`);
}

export async function uninstallSchedule(): Promise<void> {
  const path = plistPath();
  if (!existsSync(path)) {
    console.log("No schedule installed.");
    return;
  }
  launchctl(["unload", path]);
  await rm(path);
  console.log(`Removed launchd agent ${LABEL}`);
}

export function scheduleStatus(): void {
  const path = plistPath();
  if (!existsSync(path)) {
    console.log("Not scheduled. Install with: pa schedule install");
    return;
  }
  const res = Bun.spawnSync(["launchctl", "list", LABEL]);
  console.log(`Plist: ${path}`);
  console.log(res.exitCode === 0 ? "Loaded:\n" + res.stdout.toString().trim() : "Plist present but not loaded.");
  console.log(`Logs: ${logPaths().out}`);
}
