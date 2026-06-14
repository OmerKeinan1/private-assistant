import { describe, expect, test } from "bun:test";
import { route, type RoutesConfig } from "../src/router/rules.ts";
import type { Meeting } from "../src/sources/timeless.ts";

const config: RoutesConfig = {
  rules: [
    { repo: "private-assistant", match: { titleRegex: "private[- ]?assistant" } },
    { repo: "semag", folder: "docs/meetings", match: { titleRegex: "semag" } },
    { repo: "work", match: { company: "guardz" } },
    { repo: "ori-stuff", match: { participant: "ori@" } },
  ],
  fallback: { type: "drive", folder: "Meetings - Unrouted" },
};

function meeting(overrides: Partial<Meeting>): Meeting {
  return {
    id: "mtg_1",
    title: "Untitled",
    status: "completed",
    start_time: "2026-06-14T10:00:00Z",
    created_at: "2026-06-14T11:00:00Z",
    ...overrides,
  };
}

describe("route", () => {
  test("matches titleRegex case-insensitively", () => {
    const dest = route(meeting({ title: "Private Assistant sync" }), config);
    expect(dest).toEqual({
      kind: "repo",
      repo: "private-assistant",
      folder: "meetings",
      matchedBy: { titleRegex: "private[- ]?assistant" },
    });
  });

  test("honors a custom folder", () => {
    const dest = route(meeting({ title: "semag planning" }), config);
    expect(dest).toMatchObject({ kind: "repo", repo: "semag", folder: "docs/meetings" });
  });

  test("matches on participant company", () => {
    const dest = route(
      meeting({ title: "Quarterly review", participants: [{ company: "Guardz Essentials" }] }),
      config,
    );
    expect(dest).toMatchObject({ kind: "repo", repo: "work" });
  });

  test("matches on participant email substring", () => {
    const dest = route(
      meeting({ title: "1:1", participants: [{ email: "ori@example.com" }] }),
      config,
    );
    expect(dest).toMatchObject({ kind: "repo", repo: "ori-stuff" });
  });

  test("first matching rule wins", () => {
    const dest = route(
      meeting({ title: "private-assistant", participants: [{ company: "guardz" }] }),
      config,
    );
    expect(dest).toMatchObject({ repo: "private-assistant" });
  });

  test("falls back to Drive when nothing matches", () => {
    const dest = route(meeting({ title: "Random chat" }), config);
    expect(dest).toEqual({ kind: "drive", folder: "Meetings - Unrouted" });
  });

  test("AND-s multiple conditions within a rule", () => {
    const cfg: RoutesConfig = {
      rules: [{ repo: "x", match: { company: "acme", titleRegex: "budget" } }],
      fallback: { type: "drive", folder: "Unrouted" },
    };
    // company matches but title does not -> no match
    expect(
      route(meeting({ title: "lunch", participants: [{ company: "Acme" }] }), cfg).kind,
    ).toBe("drive");
    // both match
    expect(
      route(meeting({ title: "Budget Q3", participants: [{ company: "Acme" }] }), cfg),
    ).toMatchObject({ repo: "x" });
  });
});
