import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { fileCheckpoint } from './checkpoint.ts';
import { triage } from './coordinator.ts';
import { fileAudit } from './guardrails.ts';
import { renderMarkdown } from './report.ts';
import { loadTickets } from './tickets.ts';
import { WORKER_BUDGET_USD } from './worker.ts';

// Triage the desk's open tickets. This runs Claude agents and is billed to the API key.
//
//   node src/cli.ts                         say what it would do and spend, and stop
//   node src/cli.ts --yes                   do it, in a new run folder under runs/
//   node src/cli.ts --yes --run <id>        resume that run: reuse what it finished, retry what failed
//   node src/cli.ts --yes --budget 1.50     spend at most this much (default 3)

const { values } = parseArgs({
  options: {
    yes: { type: 'boolean', default: false },
    run: { type: 'string' },
    budget: { type: 'string', default: '3' },
    concurrency: { type: 'string', default: '3' },
  },
});

const budgetUsd = Number(values.budget);
const concurrency = Number(values.concurrency);
// Checked before anything is printed or run. Number('abc') is NaN, and no amount spent is ever >= NaN, so
// an unreadable budget would quietly remove the cap; a concurrency of 0 or NaN would start no workers.
if (!(Number.isFinite(budgetUsd) && budgetUsd > 0)) {
  console.error(`--budget must be a positive number of dollars, not '${values.budget}'.`);
  process.exit(2);
}
if (!(Number.isInteger(concurrency) && concurrency > 0)) {
  console.error(`--concurrency must be a positive whole number, not '${values.concurrency}'.`);
  process.exit(2);
}
const open = loadTickets().filter((t) => t.status === 'open');
const runId = values.run ?? new Date().toISOString().replaceAll(/[:.]/g, '-');
const dir = join('runs', runId);

// The cap is checked before each worker starts, so workers already running can take it over by their
// own budgets (ADR 0004).
const ceiling = budgetUsd + (concurrency - 1) * WORKER_BUDGET_USD;
console.error(`${open.length} open tickets, ${concurrency} workers at a time, at most $${WORKER_BUDGET_USD.toFixed(2)} each.`);
console.error(`Run budget $${budgetUsd.toFixed(2)}; with workers in flight it can reach $${ceiling.toFixed(2)}. Results go to ${dir}/.`);

if (!values.yes) {
  console.error('Nothing was run. Add --yes to run it.');
  process.exit(3);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set. The Agent SDK is documented to use an API key; set one with a spend limit.');
  process.exit(2);
}

mkdirSync(dir, { recursive: true });
const report = await triage(open, {
  concurrency,
  budgetUsd,
  audit: fileAudit(join(dir, 'audit.jsonl')),
  checkpoint: fileCheckpoint(join(dir, 'results')),
});

writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2));
const markdown = renderMarkdown(report, runId);
writeFileSync(join(dir, 'report.md'), markdown);
console.log(markdown);
process.exit(report.status === 'complete' ? 0 : 1);
