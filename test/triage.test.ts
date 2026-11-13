import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../src/triage.ts';
import { loadTickets } from '../src/tickets.ts';

test('the prompt carries every open ticket', () => {
  const open = loadTickets().filter((t) => t.status === 'open');
  const prompt = buildPrompt(open);
  for (const t of open) {
    assert.ok(prompt.includes(t.id), t.id);
  }
});
