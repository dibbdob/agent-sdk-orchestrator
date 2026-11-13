import { checkFinding, groupByCause, type CheckedFinding } from './finding.ts';
import { loadKnowledge } from './knowledge.ts';
import { sdkRunner, type AgentRunner } from './runner.ts';
import { synthesisSpec } from './synthesis.ts';
import { loadTickets, type Ticket } from './tickets.ts';
import { workerSpec } from './worker.ts';

/** Run `work` over `items` with at most `limit` in flight, keeping results in input order. */
export async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await work(items[i]!);
    }
  });
  await Promise.all(lanes);
  return results;
}

export type Report = {
  findings: CheckedFinding[];
  incidents: { cause_id: string; tickets: string[] }[];
  summary: string;
};

/**
 * The hub: one worker per ticket, every finding checked, tickets grouped by cause in code, and one
 * synthesis agent that sees findings rather than customers' text.
 */
export async function triage(
  tickets: Ticket[] = loadTickets().filter((t) => t.status === 'open'),
  runner: AgentRunner = sdkRunner,
  concurrency = 3,
): Promise<Report> {
  const knowledge = loadKnowledge();
  const outcomes = await pool(tickets, concurrency, async (ticket) => ({ ticket, outcome: await runner(workerSpec(ticket, knowledge)) }));

  const findings = outcomes
    .map(({ ticket, outcome }) => (outcome.ok ? checkFinding(outcome.structured, ticket, knowledge) : null))
    .filter((f): f is CheckedFinding => f !== null);
  // An incident is a cause with more than one customer. Everything else is reported ticket by ticket.
  const shared = new Map([...groupByCause(findings)].filter(([, fs]) => fs.length > 1));
  const inIncident = new Set([...shared.values()].flat().map((f) => f.ticket_id));
  const alone = findings.filter((f) => !inIncident.has(f.ticket_id));

  const synthesis = await runner(synthesisSpec(shared, alone, knowledge));
  return {
    findings,
    incidents: [...shared].map(([cause_id, fs]) => ({ cause_id, tickets: fs.map((f) => f.ticket_id) })),
    summary: synthesis.ok ? synthesis.text : `(no summary: ${synthesis.reason})`,
  };
}
