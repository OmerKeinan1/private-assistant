# destinations/

Where routed notes get filed.

- **repo** (`repo.ts`) — files the markdown note into the destination repo's **local
  clone** at `meetings/<YYYY-MM-DD>-<meeting_id>.md`:
  - **Private repo** → commit the note (path-scoped, so other changes are untouched) and
    push.
  - **Public repo** → write the note into a `.gitignore`d folder so it stays on disk and
    is never published. Repo visibility is read from the GitHub API.

  Idempotent by path: if the note already exists, the meeting is skipped, which is what
  makes the poll safe to run on any interval. Clones are located under `GITHUB_REPOS_DIR`.
- **drive** (`drive.ts`, planned) — Google Drive catch-all for meetings that match no
  routing rule.
