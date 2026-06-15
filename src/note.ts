// Assembles the markdown note we file: YAML frontmatter (meeting metadata) plus
// each AI-generated Timeless document under its title.

import type { Meeting, DocumentResponse } from "./sources/timeless.ts";

/** Path within the destination repo/folder: <folder>/<YYYY-MM-DD>-<id>.md */
export function notePath(folder: string, meeting: Meeting): string {
  const date = meeting.start_time.slice(0, 10);
  return `${folder}/${date}-${meeting.id}.md`;
}

function yamlString(value: string): string {
  // Quote and escape so titles with colons/quotes stay valid YAML.
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function frontmatter(meeting: Meeting): string {
  const lines = [
    "---",
    `meeting_id: ${meeting.id}`,
    `title: ${yamlString(meeting.title)}`,
    `date: ${meeting.start_time.slice(0, 10)}`,
    `start_time: ${meeting.start_time}`,
  ];
  if (meeting.source) lines.push(`source: ${yamlString(meeting.source)}`);

  const participants = meeting.participants ?? [];
  if (participants.length > 0) {
    lines.push("participants:");
    for (const p of participants) {
      const label = [p.name, p.email && `<${p.email}>`, p.company && `(${p.company})`]
        .filter(Boolean)
        .join(" ");
      lines.push(`  - ${yamlString(label || "unknown")}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

/** Builds the full note from the meeting metadata and its markdown documents. */
export function buildNote(meeting: Meeting, documents: DocumentResponse[]): string {
  const sections = documents.map((doc) => {
    const heading = doc.title?.trim() || "Notes";
    return `## ${heading}\n\n${doc.content.trim()}`;
  });

  const body =
    sections.length > 0
      ? sections.join("\n\n")
      : "_No AI-generated documents were available for this meeting._";

  return `${frontmatter(meeting)}\n\n# ${meeting.title}\n\n${body}\n`;
}
