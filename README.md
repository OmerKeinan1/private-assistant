# private-assistant

I finish a meeting; the notes show up in the right place without me thinking about it.

private-assistant polls a transcription tool for new meeting recordings, decides where
each one belongs, and files the markdown note into the matching GitHub repo (or a Google
Drive catch-all). It runs as a small CLI on a schedule.

> Status: early. The pull side (Timeless) is wired up as a dry-run. Routing and filing
> are next.

## How it works

```
  Timeless  ──poll──▶  private-assistant  ──file──▶  GitHub repo /meetings/
  (source)             pull → route                  or Google Drive (catch-all)
```

1. **Pull.** Poll Timeless for completed meetings in a rolling lookback window.
2. **Route.** Deterministic rules first (company / participant / title / regex). An LLM
   reads the transcript only for meetings the rules cannot place, and proposes a
   destination rather than deciding one outright.
3. **File.** Write the note to `meetings/<date>-<id>.md` in the matched repo. Filing is
   idempotent by path: if the note already exists, the meeting is skipped, so the poll
   is safe to run on any interval.

## Requirements

- [Bun](https://bun.sh) 1.3+
- A Timeless API token ([docs.timeless.day](https://docs.timeless.day))

## Setup

```bash
bun install
cp .env.example .env   # then fill in TIMELESS_API_TOKEN
```

## Usage

```bash
bun run pull --dry-run          # list recent completed meetings
bun run pull --dry-run --days 7 # widen the lookback window
```

## Routing config

Copy `config/routes.example.json` to `config/routes.json` and edit the rule table.
Rules are evaluated top to bottom; the first match wins. Anything unmatched goes to the
Drive catch-all.

## License

MIT
