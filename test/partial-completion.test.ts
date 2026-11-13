import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triage } from '../src/coordinator.ts';
import { loadTickets } from '../src/tickets.ts';
import type { AgentOutcome } from '../src/runner.ts';
import { fakeRunner, ok } from './fakes.ts';

const open = loadTickets().filter((t) => t.status === 'open');
const idOf = (prompt: string) => /T-\d{4}/.exec(prompt)![0];
const finding = (id: string) => ({ ticket_id: id, cause_id: 'unknown', summary: 's', confidence: 'low', evidence: [], needs_human: false });
const failure = (reason: string, costUsd = 0.05): AgentOutcome => ({ ok: false, reason, detail: reason, costUsd, turns: 8 });

function runWith(special: Record<string, AgentOutcome>, synthesis: AgentOutcome = ok('summary', undefined, 0.2)) {
  return fakeRunner((spec) => {
    if (spec.label === 'synthesis') {
      return synthesis;
    }

    const id = idOf(spec.prompt);
    return special[id] ?? ok('', finding(id), 0.01);
  });
}

test('a run where every worker succeeds is complete', async () => {
  const fake = runWith({});
  const report = await triage(open, { runner: fake.run });

  assert.equal(report.status, 'complete');
  assert.equal(report.results.length, open.length);
});

test('a failed worker and a worker that replied with something else are both reported, and the run is partial', async () => {
  const fake = runWith({ 'T-1006': failure('error_max_turns'), 'T-1009': ok('', { not: 'a finding' }) });

  const report = await triage(open, { runner: fake.run });

  assert.equal(report.status, 'partial');
  assert.equal(report.results.length, open.length, 'every ticket has a result');
  const byId = Object.fromEntries(report.results.map((r) => [r.ticket_id, r]));
  assert.deepEqual([byId['T-1006']!.status, byId['T-1009']!.status], ['failed', 'failed']);
  assert.equal(byId['T-1006']!.status === 'failed' && byId['T-1006']!.reason, 'error_max_turns');
  assert.equal(byId['T-1009']!.status === 'failed' && byId['T-1009']!.reason, 'not_a_finding');
  assert.equal(report.findings.length, open.length - 2);
});

test('the synthesiser is told which tickets were not investigated', async () => {
  const fake = runWith({ 'T-1006': failure('error_max_budget_usd') });

  await triage(open, { runner: fake.run });

  const prompt = fake.specs.find((s) => s.label === 'synthesis')!.prompt;
  assert.match(prompt, /Not investigated[^\n]*\n\s*T-1006/);
  assert.match(prompt, /do not describe the investigation as complete/);
});

test('the synthesiser is told how many tickets there were, rather than counting them', async () => {
  // The first real run's summary said "all 11 tickets were investigated" of ten.
  const fake = runWith({ 'T-1006': failure('error_max_budget_usd') });

  await triage(open, { runner: fake.run });

  const prompt = fake.specs.find((s) => s.label === 'synthesis')!.prompt;
  assert.match(prompt, new RegExp(`^${open.length} open tickets: ${open.length - 1} investigated, 1 not\\.$`, 'm'));
});

test('a failed synthesis keeps the findings and says why there is no summary', async () => {
  const fake = runWith({}, failure('exception', 0));

  const report = await triage(open, { runner: fake.run });

  assert.equal(report.findings.length, open.length);
  assert.match(report.summary, /synthesis run failed with exception; the findings above stand/);
});

test('the cost includes every worker, failed or not, and the synthesis', async () => {
  const fake = runWith({ 'T-1006': failure('error_max_turns', 0.05) });

  const report = await triage(open, { runner: fake.run });

  const expected = 0.01 * (open.length - 1) + 0.05 + 0.2;
  assert.ok(Math.abs(report.costUsd - expected) < 1e-9, `${report.costUsd} vs ${expected}`);
});
