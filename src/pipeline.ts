// Orchestrates one pass: route each meeting, assemble its note, and file it into
// the destination repo's local clone. Dry-run does everything except the write,
// and reports what would happen (push to a private repo vs local-only for public).

import type { Meeting, DocumentResponse, TimelessClient } from "./sources/timeless.ts";
import { route, type RoutesConfig } from "./router/rules.ts";
import { buildNote, notePath } from "./note.ts";
import type { RepoFiler, FileResult, Visibility } from "./destinations/repo.ts";

export interface PipelineDeps {
  timeless: TimelessClient;
  routes: RoutesConfig;
  filer: RepoFiler;
  dryRun: boolean;
}

export type Outcome =
  | {
      kind: "preview";
      meeting: Meeting;
      repo: string;
      path: string;
      visibility: Visibility;
      cloneFound: boolean;
      fallback: boolean;
      note: string;
    }
  | {
      kind: "filed";
      meeting: Meeting;
      repo: string;
      path: string;
      fallback: boolean;
      result: FileResult;
    };

async function fetchDocuments(
  timeless: TimelessClient,
  meeting: Meeting,
): Promise<DocumentResponse[]> {
  const docs = meeting.documents ?? [];
  return Promise.all(docs.map((d) => timeless.getDocument(d.id, "markdown")));
}

export async function processMeeting(meeting: Meeting, deps: PipelineDeps): Promise<Outcome> {
  const dest = route(meeting, deps.routes);
  const fallback = dest.matchedBy === null;
  const path = notePath(dest.folder, meeting);

  // Already filed? Skip before doing any further work. Safe to re-run on any interval.
  if (deps.filer.exists(dest.repo, path)) {
    return {
      kind: "filed",
      meeting,
      repo: dest.repo,
      path,
      fallback,
      result: { status: "skipped", reason: "exists" },
    };
  }

  const documents = await fetchDocuments(deps.timeless, meeting);
  const note = buildNote(meeting, documents);

  if (deps.dryRun) {
    return {
      kind: "preview",
      meeting,
      repo: dest.repo,
      path,
      visibility: await deps.filer.visibility(dest.repo),
      cloneFound: deps.filer.hasClone(dest.repo),
      fallback,
      note,
    };
  }

  const message = `Add meeting notes: ${meeting.title} (${meeting.start_time.slice(0, 10)})`;
  const result = await deps.filer.fileNote(dest.repo, path, note, message);
  return { kind: "filed", meeting, repo: dest.repo, path, fallback, result };
}

export async function runPipeline(meetings: Meeting[], deps: PipelineDeps): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const meeting of meetings) {
    outcomes.push(await processMeeting(meeting, deps));
  }
  return outcomes;
}
