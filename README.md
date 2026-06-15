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
   destination rather than deciding one outright. (LLM fallback is planned.)
3. **File.** Write the note to `meetings/<date>-<id>.md` in the matched repo's local
   clone. A **private** repo gets the note committed and pushed; a **public** repo gets
   it written into a gitignored folder so it stays local and is never published.
   Filing is idempotent by path: if the note already exists, the meeting is skipped, so
   the poll is safe to run on any interval.

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
bun run pull --dry-run          # route + assemble notes, write nothing (preview)
bun run pull --dry-run --days 7 # widen the lookback window
bun run pull                    # route, assemble, and file notes for real
```

## Scheduling

Run the poll unattended via a launchd agent:

```bash
bun run src/index.ts schedule install   # every 15 min (default); --interval <seconds>
bun run src/index.ts schedule status
bun run src/index.ts schedule uninstall
```

Install it from the directory that holds your `.env` and `config/routes.json`; the
agent runs `pull` from there. Logs go to `~/Library/Logs/private-assistant.log`.

## Routing config

Copy `config/routes.example.json` to `config/routes.json` and edit the rule table.
Rules are evaluated top to bottom; the first match wins. Anything unmatched goes to the
Drive catch-all.

## License

MIT
