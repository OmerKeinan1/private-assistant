import { describe, expect, test } from "bun:test";
import { buildNote, notePath } from "../src/note.ts";
import type { Meeting, DocumentResponse } from "../src/sources/timeless.ts";

const meeting: Meeting = {
  id: "mtg_abc",
  title: 'Ori & Omer: "Workflow"',
  status: "completed",
  source: "Google Meet",
  start_time: "2026-06-14T10:00:00Z",
  created_at: "2026-06-14T11:00:00Z",
  participants: [
    { name: "Omer", email: "omer@example.com", company: "Guardz Essentials" },
    { name: "Ori" },
  ],
};

function doc(title: string, content: string): DocumentResponse {
  return { id: "d", title, format: "markdown", content, created_at: "2026-06-14T11:00:00Z" };
}

describe("notePath", () => {
  test("is <folder>/<date>-<id>.md", () => {
    expect(notePath("meetings", meeting)).toBe("meetings/2026-06-14-mtg_abc.md");
  });
});

describe("buildNote", () => {
  test("emits frontmatter with escaped title and participants", () => {
    const note = buildNote(meeting, [doc("Summary", "It went well.")]);
    expect(note).toContain("meeting_id: mtg_abc");
    expect(note).toContain('title: "Ori & Omer: \\"Workflow\\""');
    expect(note).toContain("date: 2026-06-14");
    expect(note).toContain('  - "Omer <omer@example.com> (Guardz Essentials)"');
    expect(note).toContain("## Summary");
    expect(note).toContain("It went well.");
  });

  test("handles a meeting with no documents", () => {
    const note = buildNote(meeting, []);
    expect(note).toContain("_No AI-generated documents were available");
  });

  test("renders multiple documents as sections", () => {
    const note = buildNote(meeting, [doc("Summary", "S"), doc("Action Items", "- do thing")]);
    expect(note).toContain("## Summary");
    expect(note).toContain("## Action Items");
    expect(note.indexOf("## Summary")).toBeLessThan(note.indexOf("## Action Items"));
  });
});
