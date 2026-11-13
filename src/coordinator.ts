import { loadKnowledge } from './knowledge.ts';
import { sdkRunner, type AgentOutcome, type AgentRunner } from './runner.ts';
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

/**
 * The hub. It decides which tickets get a worker, starts each in its own context, and collects what
 * comes back. Orchestration is code, not a model: fan-out is a loop, so it is predictable, testable and
 * free.
 */
export async function investigateAll(
  tickets: Ticket[] = loadTickets().filter((t) => t.status === 'open'),
  runner: AgentRunner = sdkRunner,
  concurrency = 3,
): Promise<{ ticket: Ticket; outcome: AgentOutcome }[]> {
  const knowledge = loadKnowledge();
  return pool(tickets, concurrency, async (ticket) => ({ ticket, outcome: await runner(workerSpec(ticket, knowledge)) }));
}
