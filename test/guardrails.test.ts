import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HookInput } from '@anthropic-ai/claude-agent-sdk';
import { triage } from '../src/coordinator.ts';
import { DESK_TOOLS } from '../src/desk-tools.ts';
import { allowedFor, auditHook, toolGuard, type AuditEntry } from '../src/guardrails.ts';
import { loadKnowledge } from '../src/knowledge.ts';
import { loadTickets } from '../src/tickets.ts';
import { WORKER_BUDGET_USD, workerSpec } from '../src/worker.ts';
import { fakeRunner, ok } from './fakes.ts';

const open = loadTickets().filter((t) => t.status === 'open');
const signal = new AbortController().signal;
const base = { tool_use_id: 'u1', session_id: 's', transcript_path: '', cwd: '' };
const pre = (tool_name: string) => ({ ...base, hook_event_name: 'PreToolUse', tool_name, tool_input: {} }) as HookInput;

type Decision = { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } };

test('the guard lets a worker use its two desk tools and deliver its finding, and nothing else', async () => {
  const guard = toolGuard(allowedFor(DESK_TOOLS));

  for (const name of [...DESK_TOOLS, 'StructuredOutput']) {
    assert.deepEqual(await guard(pre(name), 'u1', { signal }), {}, name);
  }

  for (const name of ['Bash', 'Read', 'WebFetch', 'mcp__desk__close_ticket', 'mcp__other__read_ticket']) {
    const out = (await guard(pre(name), 'u1', { signal })) as Decision;
    assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny', name);
    assert.match(out.hookSpecificOutput!.permissionDecisionReason!, /not one of this worker's tools/);
  }
});

test('every tool call is recorded with the worker that made it', async () => {
  const entries: AuditEntry[] = [];
  const hook = auditHook('worker T-1008', (e) => entries.push(e), () => new Date('2026-11-13T10:00:00Z'));
  const input = { ...base, hook_event_name: 'PostToolUse', tool_name: 'mcp__desk__search_knowledge', tool_input: { words: 'webhook' }, tool_response: {} } as HookInput;

  await hook(input, 'u1', { signal });

  assert.deepEqual(entries, [{ at: '2026-11-13T10:00:00.000Z', worker: 'worker T-1008', tool: 'mcp__desk__search_knowledge', input: { words: 'webhook' } }]);
});

test('each worker carries its guard, its audit hook and its own budget', () => {
  const { options } = workerSpec(open[0]!, loadKnowledge());

  assert.equal(options.maxBudgetUsd, WORKER_BUDGET_USD);
  assert.equal(options.hooks?.PreToolUse?.length, 1);
  assert.equal(options.hooks?.PostToolUse?.length, 1);
});

test('once the run budget is spent no further worker starts, and those tickets say why', async () => {
  const finding = (id: string) => ({ ticket_id: id, cause_id: 'unknown', summary: 's', confidence: 'low', evidence: [], needs_human: false });
  const fake = fakeRunner((spec) => (spec.label === 'synthesis' ? ok('summary', undefined, 0.1) : ok('', finding(/T-\d{4}/.exec(spec.prompt)![0]), 0.4)));

  const report = await triage(open, { runner: fake.run, concurrency: 1, budgetUsd: 1.0 });

  const started = fake.specs.filter((s) => s.label.startsWith('worker')).length;
  assert.equal(started, 3, 'three workers at $0.40 reach $1.20; the fourth does not start');
  const skipped = report.results.filter((r) => r.status === 'failed' && r.reason === 'run_budget_spent');
  assert.equal(skipped.length, open.length - 3);
  assert.equal(report.status, 'partial');
  assert.equal(fake.specs.some((s) => s.label === 'synthesis'), false, 'nothing was left for the synthesis');
});
