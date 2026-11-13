import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triage } from '../src/coordinator.ts';
import { checkFinding, FINDING_SCHEMA, type Finding } from '../src/finding.ts';
import { loadKnowledge } from '../src/knowledge.ts';
import { loadTickets } from '../src/tickets.ts';
import { workerSpec } from '../src/worker.ts';
import { fakeRunner, ok } from './fakes.ts';

const tickets = loadTickets();
const open = tickets.filter((t) => t.status === 'open');
const knowledge = loadKnowledge();
const byId = (id: string) => tickets.find((t) => t.id === id)!;

const finding = (over: Partial<Finding> & { ticket_id: string }): Finding => ({
  cause_id: 'unknown', summary: 'Looked into it.', confidence: 'low', evidence: [], needs_human: false, ...over,
});

/** What each worker would conclude, by ticket, for a run where the investigation goes as hoped. */
const answers: Record<string, Partial<Finding>> = {
  'T-1001': { cause_id: 'INC-1110', confidence: 'high', evidence: ['INC-1110'] },
  'T-1008': { cause_id: 'REL-2611-1', confidence: 'high', evidence: ['REL-2611-1'] },
  'T-1011': { cause_id: 'REL-2611-2', confidence: 'high', evidence: ['REL-2611-2'] },
  'T-1013': { cause_id: 'REL-2611-1', confidence: 'high', evidence: ['REL-2611-1'] },
  'T-1009': { cause_id: 'REL-2611-3', confidence: 'medium', evidence: ['REL-2611-3'] },
  'T-1010': { needs_human: true },
};

test('each worker is asked for a finding in the schema', () => {
  const { options } = workerSpec(byId('T-1008'), knowledge);
  assert.deepEqual(options.outputFormat, { type: 'json_schema', schema: FINDING_SCHEMA });
  assert.deepEqual((FINDING_SCHEMA.required as string[]).sort(), ['cause_id', 'confidence', 'evidence', 'needs_human', 'summary', 'ticket_id']);
});

test('a finding that cites an id the knowledge base lacks loses its confidence and goes to a person', () => {
  const f = checkFinding(finding({ ticket_id: 'T-1008', cause_id: 'REL-2611-1', confidence: 'high', evidence: ['REL-2611-1', 'REL-9999'] }), byId('T-1008'), knowledge)!;

  assert.deepEqual(f.evidence, ['REL-2611-1']);
  assert.equal(f.confidence, 'low');
  assert.equal(f.needs_human, true);
  assert.match(f.checks[0]!, /REL-9999/);
});

test('a cause that is not among the evidence is not a cause', () => {
  const f = checkFinding(finding({ ticket_id: 'T-1002', cause_id: 'REL-2611-2', confidence: 'medium' }), byId('T-1002'), knowledge)!;
  assert.equal(f.cause_id, 'unknown');
  assert.equal(f.confidence, 'low');
});

test('high confidence with no evidence is lowered', () => {
  const f = checkFinding(finding({ ticket_id: 'T-1002', confidence: 'high' }), byId('T-1002'), knowledge)!;
  assert.equal(f.confidence, 'medium');
});

test('a reply about a different ticket, or not a finding at all, is not accepted', () => {
  assert.equal(checkFinding(finding({ ticket_id: 'T-1001' }), byId('T-1002'), knowledge), null);
  assert.equal(checkFinding({ ticket_id: 'T-1002' }, byId('T-1002'), knowledge), null);
});

test('tickets that share a cause become one incident, and the synthesiser never sees a customer message', async () => {
  const fake = fakeRunner((spec) => {
    if (spec.label === 'synthesis') {
      return ok('summary');
    }

    const id = /T-\d{4}/.exec(spec.prompt)![0];
    return ok('', finding({ ticket_id: id, ...(answers[id] ?? {}) }));
  });

  // T-1008 and T-1013 cite the same change; T-1011 is the same release but a different change, and
  // T-1001 is the only customer of its cause, so neither is an incident.
  const report = await triage(open, { runner: fake.run, concurrency: 3 });

  assert.deepEqual(report.incidents, [{ cause_id: 'REL-2611-1', tickets: ['T-1008', 'T-1013'] }]);
  const synthesis = fake.specs.find((s) => s.label === 'synthesis')!;
  for (const t of open) {
    assert.ok(!synthesis.prompt.includes(t.body), `the synthesis prompt carries ${t.id}'s message`);
  }
  assert.match(synthesis.prompt, /REL-2611-1: Webhook delivery now retries/);
});
