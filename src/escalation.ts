import type { TicketResult } from './coordinator.ts';
import type { Ticket } from './tickets.ts';

/** One ticket a person has to look at, and why. */
export type Escalation = { ticket_id: string; priority: string; reason: string };

const PRIORITY_ORDER = ['urgent', 'high', 'normal', 'low'];

/**
 * The tickets a person must see, worst first. In order of how little is known:
 *   1. not investigated at all (the investigation failed, or the budget ran out);
 *   2. the worker said a person is needed (security, legal, data, or unresolved);
 *   3. the hub had to correct the finding (invented or uncited evidence);
 *   4. low confidence.
 * Within each, by the ticket's priority. A confident, uncorrected finding does not escalate: the queue is
 * for what the agents could not settle, and a queue holding everything is read by nobody.
 */
export function escalations(results: TicketResult[], tickets: Ticket[]): Escalation[] {
  const priority = (id: string) => tickets.find((t) => t.id === id)?.priority ?? 'normal';
  const ranked: { rank: number; e: Escalation }[] = [];

  for (const r of results) {
    const p = priority(r.ticket_id);
    if (r.status === 'failed') {
      ranked.push({ rank: 1, e: { ticket_id: r.ticket_id, priority: p, reason: `not investigated: ${r.reason}` } });
    } else if (r.finding.needs_human) {
      ranked.push({ rank: 2, e: { ticket_id: r.ticket_id, priority: p, reason: `needs a person: ${r.finding.summary}` } });
    } else if (r.finding.checks.length > 0) {
      ranked.push({ rank: 3, e: { ticket_id: r.ticket_id, priority: p, reason: `finding corrected: ${r.finding.checks.join('; ')}` } });
    } else if (r.finding.confidence === 'low') {
      ranked.push({ rank: 4, e: { ticket_id: r.ticket_id, priority: p, reason: `low confidence: ${r.finding.summary}` } });
    }
  }

  return ranked
    .sort((a, b) => a.rank - b.rank || PRIORITY_ORDER.indexOf(a.e.priority) - PRIORITY_ORDER.indexOf(b.e.priority) || a.e.ticket_id.localeCompare(b.e.ticket_id))
    .map((x) => x.e);
}
