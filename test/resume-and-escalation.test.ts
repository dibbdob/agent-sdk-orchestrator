import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileCheckpoint } from '../src/checkpoint.ts';
import { triage, type TicketResult } from '../src/coordinator.ts';
import { escalations } from '../src/escalation.ts';
import type { Finding } from '../src/finding.ts';
import type { AgentOutcome } from '../src/runner.ts';
import { loadTickets } from '../src/tickets.ts';
import { fakeRunner, ok } from './fakes.ts';

const tickets = loadTickets();
const open = tickets.filter((t) => t.status === 'open');
const idOf = (prompt: string) => /T-\d{4}/.exec(prompt)![0];
const finding = (id: string, over: Partial<Finding> = {}): Finding =>
  ({ ticket_id: id, cause_id: 'unknown', summary: `about ${id}`, confidence: 'medium', evidence: [], needs_human: false, ...over });
const failure = (reason: string): AgentOutcome => ({ ok: false, reason, detail: reason, costUsd: 0.05, turns: 8 });

test('a resumed run reuses what was investigated and tries again what failed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'triage-'));

  // First run: T-1006 fails.
  const first = fakeRunner((spec) => spec.label === 'synthesis' ? ok('s') : idOf(spec.prompt) === 'T-1006' ? failure('error_max_turns') : ok('', finding(idOf(spec.prompt))));
  const one = await triage(open, { runner: first.run, checkpoint: fileCheckpoint(dir) });
  assert.equal(one.status, 'partial');
  assert.equal(readdirSync(dir).filter((f) => f.endsWith('.json')).length, open.length);
  assert.equal(readdirSync(dir).some((f) => f.endsWith('.tmp')), false, 'no half-written files left behind');

  // Second run: only T-1006 is investigated again.
  const second = fakeRunner((spec) => spec.label === 'synthesis' ? ok('s') : ok('', finding(idOf(spec.prompt))));
  const two = await triage(open, { runner: second.run, checkpoint: fileCheckpoint(dir) });

  assert.deepEqual(second.specs.filter((s) => s.label.startsWith('worker')).map((s) => s.label), ['worker T-1006']);
  assert.equal(two.status, 'complete');
  assert.equal(two.resumed, open.length - 1);
  assert.ok(Math.abs(two.costUsd - 0.02) < 1e-9, `this run spent ${two.costUsd}: one worker and the synthesis`);
});

test('a checkpoint folder that does not exist yet is an empty checkpoint', () => {
  const dir = join(tmpdir(), `triage-none-${process.pid}-${Date.now()}`);
  assert.equal(existsSync(dir), false);
  assert.equal(fileCheckpoint(dir).load().size, 0);
});

test('the queue holds only what the agents could not settle, worst first and by priority within', () => {
  const checked = (id: string, over: Partial<Finding> = {}, checks: string[] = []): TicketResult =>
    ({ ticket_id: id, status: 'investigated', finding: { ...finding(id, over), checks }, costUsd: 0 });
  const results: TicketResult[] = [
    checked('T-1001', { confidence: 'high', cause_id: 'INC-1110', evidence: ['INC-1110'] }),
    checked('T-1002', { confidence: 'low' }),
    checked('T-1006', {}, ['cited RB-9999, which the knowledge base does not have']),
    checked('T-1010', { needs_human: true }),
    { ticket_id: 'T-1009', status: 'failed', reason: 'error_max_budget_usd', detail: '', costUsd: 0 },
    { ticket_id: 'T-1007', status: 'failed', reason: 'exception', detail: '', costUsd: 0 },
  ];

  const queue = escalations(results, tickets);

  assert.deepEqual(queue.map((e) => e.ticket_id), ['T-1009', 'T-1007', 'T-1010', 'T-1006', 'T-1002']);
  assert.match(queue[0]!.reason, /not investigated: error_max_budget_usd/);
  assert.ok(!queue.some((e) => e.ticket_id === 'T-1001'), 'a confident, uncorrected finding does not escalate');
});

test('the report carries the queue', async () => {
  const fake = fakeRunner((spec) => spec.label === 'synthesis' ? ok('s') : ok('', finding(idOf(spec.prompt), { needs_human: idOf(spec.prompt) === 'T-1010' })));

  const report = await triage(open, { runner: fake.run });

  assert.deepEqual(report.escalations.map((e) => e.ticket_id), ['T-1010']);
});
