import { z } from 'zod';
import type { KnowledgeItem } from './knowledge.ts';
import type { Ticket } from './tickets.ts';

/** What a worker hands back. The schema is sent to the SDK as outputFormat, so the reply is this shape. */
export const Finding = z.object({
  ticket_id: z.string().describe('The id of the ticket you investigated.'),
  cause_id: z.string().describe('The id of the knowledge-base item that explains the problem, or "unknown".'),
  summary: z.string().max(300).describe('One or two sentences: what is wrong and why you think so.'),
  confidence: z.enum(['low', 'medium', 'high']).describe('high only when a cited item clearly explains the ticket.'),
  evidence: z.array(z.string()).describe('Ids of the knowledge-base items you relied on. Empty if none.'),
  needs_human: z.boolean().describe('true for security, legal or data requests, or anything you could not resolve.'),
});
export type Finding = z.infer<typeof Finding>;

export const FINDING_SCHEMA = z.toJSONSchema(Finding, { target: 'draft-7' }) as Record<string, unknown>;

/** A finding after the hub has checked it, with every adjustment it made and why. */
export type CheckedFinding = Finding & { checks: string[] };

/**
 * The hub does not take a worker's word for its evidence. A cited id that is not in the knowledge base is
 * removed and the finding loses its confidence; a cause that is not among the evidence is not a cause.
 * Returns null when the reply is not a finding about this ticket at all.
 */
export function checkFinding(raw: unknown, ticket: Ticket, knowledge: KnowledgeItem[]): CheckedFinding | null {
  const parsed = Finding.safeParse(raw);
  if (!parsed.success || parsed.data.ticket_id.toUpperCase() !== ticket.id) {
    return null;
  }

  const known = new Set(knowledge.map((k) => k.id));
  const f: CheckedFinding = { ...parsed.data, checks: [] };

  const invented = f.evidence.filter((id) => !known.has(id));
  if (invented.length > 0) {
    f.evidence = f.evidence.filter((id) => known.has(id));
    f.confidence = 'low';
    f.needs_human = true;
    f.checks.push(`cited ${invented.join(', ')}, which the knowledge base does not have`);
  }

  if (f.cause_id !== 'unknown' && !f.evidence.includes(f.cause_id)) {
    f.checks.push(`named ${f.cause_id} as the cause without citing it`);
    f.cause_id = 'unknown';
    f.confidence = 'low';
  }

  if (f.confidence === 'high' && f.evidence.length === 0) {
    f.confidence = 'medium';
    f.checks.push('claimed high confidence with no evidence');
  }

  return f;
}

/** Tickets that share a cause, which is how an incident shows itself. Unknown causes are never grouped. */
export function groupByCause(findings: CheckedFinding[]): Map<string, CheckedFinding[]> {
  const groups = new Map<string, CheckedFinding[]>();
  for (const f of findings.filter((x) => x.cause_id !== 'unknown')) {
    groups.set(f.cause_id, [...(groups.get(f.cause_id) ?? []), f]);
  }

  return groups;
}
