// Typed client for the Timeless API (https://docs.timeless.day).
// Base: https://api.timeless.day/v1, Bearer auth, cursor pagination, 60 req/min.

const BASE_URL = "https://api.timeless.day/v1";

export type MeetingStatus = "completed" | "processing" | "scheduled" | "failed";
export type DocumentFormat = "html" | "markdown" | "raw" | "docx" | "json";

export interface Participant {
  name?: string;
  email?: string;
  title?: string;
  company?: string;
}

export interface MeetingDocument {
  id: string;
  title?: string;
}

export interface Meeting {
  id: string;
  title: string;
  status: MeetingStatus;
  source?: string;
  start_time: string;
  end_time?: string | null;
  duration?: number | null;
  host?: { id: string; name?: string; email?: string };
  participants?: Participant[];
  // Only present when listMeetings is called with expand: ["documents"].
  documents?: MeetingDocument[];
  created_at: string;
}

export interface DocumentResponse {
  id: string;
  title: string;
  format: DocumentFormat;
  content: string;
  created_at: string;
}

interface Page<T> {
  data: T[];
  next_cursor?: string | null;
  has_more: boolean;
}

export interface ListMeetingsParams {
  status?: MeetingStatus;
  /** YYYY-MM-DD, inclusive lower bound on start time. */
  start_date?: string;
  /** YYYY-MM-DD, inclusive upper bound on start time. */
  end_date?: string;
  participant?: string;
  company?: string;
  search?: string;
  expand?: ("documents")[];
  limit?: number;
}

export class TimelessError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "TimelessError";
  }
}

export class TimelessClient {
  constructor(private token: string) {}

  /**
   * Lists meetings, transparently following cursor pagination so the caller
   * gets the full result set for the given filters.
   */
  async listMeetings(params: ListMeetingsParams = {}): Promise<Meeting[]> {
    const meetings: Meeting[] = [];
    let cursor: string | undefined;

    do {
      const query = new URLSearchParams();
      if (params.status) query.set("status", params.status);
      if (params.start_date) query.set("start_date", params.start_date);
      if (params.end_date) query.set("end_date", params.end_date);
      if (params.participant) query.set("participant", params.participant);
      if (params.company) query.set("company", params.company);
      if (params.search) query.set("search", params.search);
      if (params.expand?.length) query.set("expand", params.expand.join(","));
      query.set("limit", String(params.limit ?? 100));
      if (cursor) query.set("cursor", cursor);

      const page = await this.get<Page<Meeting>>(`/meetings?${query.toString()}`);
      meetings.push(...page.data);
      cursor = page.has_more ? page.next_cursor ?? undefined : undefined;
    } while (cursor);

    return meetings;
  }

  /** Fetches an AI-generated document, defaulting to markdown (the form we file). */
  async getDocument(id: string, format: DocumentFormat = "markdown"): Promise<DocumentResponse> {
    return this.get<DocumentResponse>(`/documents/${id}?format=${format}`);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      let code = "unknown";
      let message = res.statusText;
      try {
        const body = (await res.json()) as { code?: string; message?: string };
        code = body.code ?? code;
        message = body.message ?? message;
      } catch {
        // non-JSON error body; keep the status text
      }
      throw new TimelessError(res.status, code, message);
    }

    return (await res.json()) as T;
  }
}
