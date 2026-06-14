# destinations/

Where routed notes get filed.

- **github** (`github.ts`, planned) — commits the markdown note to
  `meetings/<YYYY-MM-DD>-<meeting_id>.md` in the matched `OmerKeinan1` repo via the
  GitHub API. Idempotent: if the path already exists, the meeting is skipped. This
  content-addressable check is what makes the pipeline safe to re-run on any interval.
- **drive** (`drive.ts`, planned) — Google Drive catch-all for meetings that match no
  routing rule.
