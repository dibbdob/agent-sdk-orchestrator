import { checkFinding, groupByCause, type CheckedFinding } from './finding.ts';
import { noCheckpoint, type Checkpoint } from './checkpoint.ts';
import { escalations, type Escalation } from './escalation.ts';
import type { AuditSink } from './guardrails.ts';
import { loadKnowledge, type KnowledgeItem } from './knowledge.ts';
import { sdkRunner, type AgentOutcome, type AgentRunner } from './runner.ts';
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

/** How one ticket's investigation ended. Every ticket has exactly one. */
export type TicketResult =
  | { ticket_id: string; status: 'investigated'; finding: CheckedFinding; costUsd: number }
  | { ticket_id: string; status: 'failed'; reason: string; detail: string; costUsd: number };

export type Report = {
  /** complete when every ticket was investigated; partial when any was not. */
  status: 'complete' | 'partial';
  results: TicketResult[];
  findings: CheckedFinding[];
  incidents: { cause_id: string; tickets: string[] }[];
  /** Every ticket a person must look at, worst first. */
  escalations: Escalation[];
  summary: string;
  /** What this run spent, not counting results reused from a checkpoint. */
  costUsd: number;
  /** How many tickets were taken from the checkpoint instead of investigated again. */
  resumed: number;
};

/** One worker's outcome as a ticket result. A failure is a result too, with its reason and its cost. */
export function toResult(ticket: Ticket, outcome: AgentOutcome, knowledge: KnowledgeItem[]): TicketResult {
  if (!outcome.ok) {
    return { ticket_id: ticket.id, status: 'failed', reason: outcome.reason, detail: outcome.detail, costUsd: outcome.costUsd };
  }

  const finding = checkFinding(outcome.structured, ticket, knowledge);
  return finding
    ? { ticket_id: ticket.id, status: 'investigated', finding, costUsd: outcome.costUsd }
    : { ticket_id: ticket.id, status: 'failed', reason: 'not_a_finding', detail: 'The reply was not a finding about this ticket.', costUsd: outcome.costUsd };
}

export type TriageOptions = {
  runner?: AgentRunner;
  concurrency?: number;
  /** What this run may spend. No worker starts once it is reached; the synthesis gets what is left. */
  budgetUsd?: number;
  audit?: AuditSink;
  /** Where each ticket's result is kept as it finishes. A ticket already investigated there is not redone. */
  checkpoint?: Checkpoint;
};

/**
 * The hub: one worker per ticket, every finding checked, tickets grouped by cause in code, and one
 * synthesis agent that sees findings rather than customers' text. A worker that fails does not stop the
 * others or vanish from the report: the run is partial, the gap is named, and the summary is told. With a
 * checkpoint, a run that was interrupted or partial picks up where it stopped: investigated tickets are
 * reused, failed ones are tried again.
 */
export async function triage(
  tickets: Ticket[] = loadTickets().filter((t) => t.status === 'open'),
  { runner = sdkRunner, concurrency = 3, budgetUsd = 3, audit = () => {}, checkpoint = noCheckpoint }: TriageOptions = {},
): Promise<Report> {
  const knowledge = loadKnowledge();
  const done = checkpoint.load();
  let spent = 0;
  let resumed = 0;
  const results = await pool(tickets, concurrency, async (ticket): Promise<TicketResult> => {
    const earlier = done.get(ticket.id);
    if (earlier?.status === 'investigated') {
      resumed++;
      return earlier;
    }

    // Checked before each start, not after each finish: workers already in flight can still take the
    // run over, by at most their own budgets.
    if (spent >= budgetUsd) {
      return { ticket_id: ticket.id, status: 'failed', reason: 'run_budget_spent', detail: `The run had spent $${spent.toFixed(2)} of $${budgetUsd.toFixed(2)}.`, costUsd: 0 };
    }

    const outcome = await runner(workerSpec(ticket, knowledge, audit));
    spent += outcome.costUsd;
    const result = toResult(ticket, outcome, knowledge);
    checkpoint.save(result);
    return result;
  });

  const findings = results.flatMap((r) => (r.status === 'investigated' ? [r.finding] : []));
  const failed = results.filter((r) => r.status === 'failed');

  // An incident is a cause with more than one customer. Everything else is reported ticket by ticket.
  const shared = new Map([...groupByCause(findings)].filter(([, fs]) => fs.length > 1));
  const inIncident = new Set([...shared.values()].flat().map((f) => f.ticket_id));
  const alone = findings.filter((f) => !inIncident.has(f.ticket_id));

  const remaining = budgetUsd - spent;
  const synthesis: AgentOutcome = remaining > 0
    ? await runner(synthesisSpec(shared, alone, knowledge, failed.map((f) => f.ticket_id), remaining))
    : { ok: false, reason: 'run_budget_spent', detail: 'Nothing was left for the synthesis.', costUsd: 0, turns: 0 };
  return {
    status: failed.length === 0 ? 'complete' : 'partial',
    results,
    findings,
    incidents: [...shared].map(([cause_id, fs]) => ({ cause_id, tickets: fs.map((f) => f.ticket_id) })),
    escalations: escalations(results, tickets),
    summary: synthesis.ok ? synthesis.text : `(no summary: the synthesis run failed with ${synthesis.reason}; the findings above stand)`,
    // What this run spent. A reused result was paid for by the run that produced it.
    costUsd: spent + synthesis.costUsd,
    resumed,
  };
}
