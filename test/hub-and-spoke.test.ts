import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triage } from '../src/coordinator.ts';
import { deskHandlers, DESK_TOOLS } from '../src/desk-tools.ts';
import { loadKnowledge, searchKnowledge } from '../src/knowledge.ts';
import { loadTickets } from '../src/tickets.ts';
import { workerSpec } from '../src/worker.ts';
import { fakeRunner, ok } from './fakes.ts';

const tickets = loadTickets();
const open = tickets.filter((t) => t.status === 'open');
const knowledge = loadKnowledge();
const t1008 = tickets.find((t) => t.id === 'T-1008')!;

test('the knowledge base is read into citable items', () => {
  assert.deepEqual(knowledge.map((k) => k.id), ['REL-2611-1', 'REL-2611-2', 'REL-2611-3', 'RB-AUTH-1', 'INC-1110', 'INC-1112']);
  assert.match(knowledge.find((k) => k.id === 'REL-2611-1')!.text, /without an idempotency key/);
});

test('a search finds the release note behind the duplicate webhooks', () => {
  assert.equal(searchKnowledge(knowledge, 'webhook retries')[0]?.id, 'REL-2611-1');
});

test('a worker can read its own ticket and is refused any other', async () => {
  const h = deskHandlers(t1008, knowledge);

  const own = await h.readTicket({ ticket_id: 'T-1008' });
  const other = await h.readTicket({ ticket_id: 'T-1001' });

  assert.match(own.content[0]!.text, /three times/);
  assert.equal(other.isError, true);
  assert.match(other.content[0]!.text, /assigned T-1008 only/);
});

test('a worker starts with nothing but its ticket id, two read-only tools, and no machine settings', () => {
  const { prompt, options } = workerSpec(t1008, knowledge);

  assert.equal(prompt, 'Investigate ticket T-1008.');
  for (const other of open.filter((t) => t.id !== 'T-1008')) {
    assert.ok(!prompt.includes(other.id) && !String(options.systemPrompt).includes(other.id));
  }

  assert.deepEqual(options.tools, []);
  assert.deepEqual(options.settingSources, []);
  assert.deepEqual(options.allowedTools, DESK_TOOLS);
  assert.deepEqual(Object.keys(options.mcpServers ?? {}), ['desk']);
});

test('every open ticket gets its own worker, never more than three at once', async () => {
  const fake = fakeRunner((spec) => ok('', spec.label === 'synthesis' ? undefined
    : { ticket_id: /T-\d{4}/.exec(spec.prompt)![0], cause_id: 'unknown', summary: 's', confidence: 'low', evidence: [], needs_human: false }));

  await triage(open, fake.run, 3);

  const workers = fake.specs.filter((s) => s.label.startsWith('worker'));
  assert.deepEqual(workers.map((s) => s.label), open.map((t) => `worker ${t.id}`));
  assert.ok(fake.maxInFlight() <= 3, `max in flight was ${fake.maxInFlight()}`);
  assert.ok(fake.maxInFlight() > 1, 'workers should run in parallel');
});
