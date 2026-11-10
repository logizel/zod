// Machine Glass feed endpoint (GET /api/machine/events).
//
// Read-only, cursor-paginated view of the append-only machine_events log.
// The live tail arrives over SSE; this endpoint hydrates the initial page and
// powers "load older" scrolling.

import * as z from 'zod';
import {
  MACHINE_EVENT_STATUSES,
  MACHINE_EVENT_TYPES,
  PIPELINES,
} from '@zod/db-hot/schema';

export const MachineEventsQuerySchema = z.object({
  /** ISO created timestamp: return rows strictly older than this cursor. */
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  tool: z.string().min(1).optional(),
  status: z.enum(MACHINE_EVENT_STATUSES).optional(),
  pipeline: z.enum(PIPELINES).optional(),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  agent: z.string().min(1).optional(),
  event_type: z.enum(MACHINE_EVENT_TYPES).optional(),
  trace_id: z.string().min(1).optional(),
});
export type MachineEventsQuery = z.infer<typeof MachineEventsQuerySchema>;

export type MachineEventDto = {
  id: string;
  created: string;
  trace_id: string;
  agent: string;
  pipeline: string;
  event_type: string;
  tool: string;
  provider: string;
  model: string;
  step: string;
  status: string;
  duration_ms: number | null;
  url: string;
  input_summary: string;
  output_summary: string;
  detail: string;
  baton_to: string;
  meta: Record<string, unknown>;
};

export interface MachineEventsListResult {
  items: Array<Record<string, unknown>>;
  totalItems?: number;
}

export interface MachineEventsPb {
  collection(name: string): {
    getList(
      page: number,
      perPage: number,
      options?: unknown,
    ): Promise<MachineEventsListResult>;
  };
}

export function parseMachineEventsQuery(query: string): MachineEventsQuery {
  const params = Object.fromEntries(new URLSearchParams(query));
  return MachineEventsQuerySchema.parse(params);
}

/** Escape a value for a PocketBase filter expression. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function buildMachineEventsFilter(query: MachineEventsQuery): string {
  const parts: string[] = [];
  if (query.cursor) parts.push(`created < ${quote(query.cursor)}`);
  if (query.tool) parts.push(`tool = ${quote(query.tool)}`);
  if (query.status) parts.push(`status = ${quote(query.status)}`);
  if (query.pipeline) parts.push(`pipeline = ${quote(query.pipeline)}`);
  if (query.provider) parts.push(`provider = ${quote(query.provider)}`);
  if (query.model) parts.push(`model = ${quote(query.model)}`);
  if (query.agent) parts.push(`agent = ${quote(query.agent)}`);
  if (query.event_type) parts.push(`event_type = ${quote(query.event_type)}`);
  if (query.trace_id) parts.push(`trace_id = ${quote(query.trace_id)}`);
  return parts.join(' && ');
}

export function toMachineEventDto(row: Record<string, unknown>): MachineEventDto {
  return {
    id: String(row.id ?? ''),
    created: String(row.created ?? ''),
    trace_id: String(row.trace_id ?? ''),
    agent: String(row.agent ?? ''),
    pipeline: String(row.pipeline ?? ''),
    event_type: String(row.event_type ?? ''),
    tool: String(row.tool ?? ''),
    provider: String(row.provider ?? ''),
    model: String(row.model ?? ''),
    step: String(row.step ?? ''),
    status: String(row.status ?? ''),
    duration_ms:
      row.duration_ms == null || row.duration_ms === ''
        ? null
        : Number(row.duration_ms),
    url: String(row.url ?? ''),
    input_summary: String(row.input_summary ?? ''),
    output_summary: String(row.output_summary ?? ''),
    detail: String(row.detail ?? ''),
    baton_to: String(row.baton_to ?? ''),
    meta:
      row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)
        ? (row.meta as Record<string, unknown>)
        : {},
  };
}

export type MachineEventsResponse = {
  ts: number;
  events: MachineEventDto[];
  nextCursor: string | null;
};

export async function handleMachineEvents(
  req: { url: string | null },
  res: {
    writeHead: (status: number, headers: Record<string, string>) => void;
    end: (body?: string) => void;
  },
  opts: { pb: MachineEventsPb; nowMs?: number },
): Promise<void> {
  let query: MachineEventsQuery;
  try {
    const rawQuery = req.url ? new URL(req.url, 'http://localhost').search : '';
    query = parseMachineEventsQuery(rawQuery);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid query parameters', issues: err.issues }));
      return;
    }
    throw err;
  }

  const filter = buildMachineEventsFilter(query);
  try {
    const page = await opts.pb.collection('machine_events').getList(1, query.limit, {
      sort: '-created',
      ...(filter ? { filter } : {}),
    });
    const events = (page.items ?? []).map(toMachineEventDto);
    const oldest = events.length > 0 ? events[events.length - 1].created : null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ts: opts.nowMs ?? Date.now(),
        events,
        nextCursor: events.length >= query.limit ? oldest : null,
      } satisfies MachineEventsResponse),
    );
  } catch {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream unavailable' }));
  }
}
