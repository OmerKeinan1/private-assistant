// Orchestrates one pass: route each meeting, assemble its note, and file it.
// Dry-run does everything except the write (it still fetches + assembles, so the
// preview reflects exactly what would be committed).

import type { Meeting, DocumentResponse, TimelessClient } from "./sources/timeless.ts";
import { route, type RoutesConfig } from "./router/rules.ts";
import { buildNote, notePath } from "./note.ts";
import type { GitHubFiler, FileResult } from "./destinations/github.ts";

export interface PipelineDeps {
  timeless: TimelessClient;
  routes: RoutesConfig;
  filer: GitHubFiler | null; // required for real (non-dry-run) filing
  dryRun: boolean;
}

export type Outcome =
  | { kind: "drive"; meeting: Meeting; folder: string }
  | { kind: "preview"; meeting: Meeting; repo: string; path: string; note: string }
  | { kind: "filed"; meeting: Meeting; repo: string; path: string; result: FileResult };

async function fetchDocuments(
  timeless: TimelessClient,
  meeting: Meeting,
): Promise<DocumentResponse[]> {
  const docs = meeting.documents ?? [];
  return Promise.all(docs.map((d) => timeless.getDocument(d.id, "markdown")));
}

export async function processMeeting(meeting: Meeting, deps: PipelineDeps): Promise<Outcome> {
  const dest = route(meeting, deps.routes);

  if (dest.kind === "drive") {
    return { kind: "drive", meeting, folder: dest.folder };
  }

  const path = notePath(dest.folder, meeting);

  // Real runs short-circuit on already-filed notes before fetching documents.
  if (!deps.dryRun) {
    if (!deps.filer) throw new Error("Filing requires a GitHub filer.");
    if (await deps.filer.exists(dest.repo, path)) {
      return { kind: "filed", meeting, repo: dest.repo, path, result: { status: "skipped", reason: "exists" } };
    }
  }

  const documents = await fetchDocuments(deps.timeless, meeting);
  const note = buildNote(meeting, documents);

  if (deps.dryRun) {
    return { kind: "preview", meeting, repo: dest.repo, path, note };
  }

  const message = `meeting notes: ${meeting.title} (${meeting.start_time.slice(0, 10)})`;
  const result = await deps.filer!.fileNote(dest.repo, path, note, message);
  return { kind: "filed", meeting, repo: dest.repo, path, result };
}

export async function runPipeline(meetings: Meeting[], deps: PipelineDeps): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const meeting of meetings) {
    outcomes.push(await processMeeting(meeting, deps));
  }
  return outcomes;
}
