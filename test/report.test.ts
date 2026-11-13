import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import type { Report } from '../src/coordinator.ts';
import { renderMarkdown } from '../src/report.ts';

const report: Report = {
  status: 'partial',
  results: [],
  findings: [{ ticket_id: 'T-1008', cause_id: 'REL-2611-1', summary: 'Retries | without a key.', confidence: 'high', evidence: ['REL-2611-1'], needs_human: false, checks: [] }],
  incidents: [{ cause_id: 'REL-2611-1', tickets: ['T-1008', 'T-1013'] }],
  escalations: [{ ticket_id: 'T-1006', priority: 'high', reason: 'not investigated: error_max_turns' }],
  summary: 'Two customers have duplicate webhooks.',
  costUsd: 0.4321,
  resumed: 2,
};

test('the report leads with what a person must do, and says when it is partial', () => {
  const md = renderMarkdown(report, 'run-1');

  assert.ok(md.indexOf('## For a person') < md.indexOf('## Incidents'));
  assert.match(md, /Status: \*\*partial\*\* \(some tickets were not investigated/);
  assert.match(md, /\| T-1006 \| high \| not investigated: error_max_turns \|/);
  assert.match(md, /- REL-2611-1: T-1008, T-1013/);
  assert.match(md, /Spent this run: \$0\.43/);
});

test('a pipe in a summary does not break the table', () => {
  assert.match(renderMarkdown(report, 'run-1'), /Retries \/ without a key\./);
});

test('the command line spends nothing without --yes', () => {
  let code = 0;
  let stderr = '';
  try {
    execFileSync(process.execPath, ['src/cli.ts'], { stdio: 'pipe', env: { ...process.env, ANTHROPIC_API_KEY: '' } });
  } catch (error) {
    const e = error as { status: number; stderr: Buffer };
    code = e.status;
    stderr = e.stderr.toString();
  }

  assert.equal(code, 3);
  assert.match(stderr, /Nothing was run/);
  assert.match(stderr, /can reach \$3\.50/);
});
