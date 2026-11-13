import type { CheckedFinding } from './finding.ts';
import type { KnowledgeItem } from './knowledge.ts';
import type { AgentSpec } from './runner.ts';

export const SYNTHESIS_MODEL = 'claude-opus-5-5';

/**
 * The last agent writes the incident summary for the desk's lead. Its input is the checked findings and
 * the text of the knowledge items they cite, never a customer's message: the workers have already read
 * those, and passing them on would hand the synthesiser nine customers' text, and T-1010's instruction,
 * for no gain.
 */
export function synthesisSpec(groups: Map<string, CheckedFinding[]>, alone: CheckedFinding[], knowledge: KnowledgeItem[], notInvestigated: string[] = []): AgentSpec {
  const cite = (id: string) => knowledge.find((k) => k.id === id)?.text ?? '(not in the knowledge base)';
  const incidents = [...groups].map(([cause, fs]) =>
    `- ${cause}: ${cite(cause)}\n  tickets: ${fs.map((f) => `${f.ticket_id} (${f.confidence}) ${f.summary}`).join(' | ')}`);
  const singles = alone.map((f) => `- ${f.ticket_id} (${f.confidence}, cause ${f.cause_id}): ${f.summary}`);

  return {
    label: 'synthesis',
    prompt: `Checked findings from the investigation of the desk's open tickets.

Shared causes:
${incidents.join('\n') || '(none)'}

Tickets with no shared cause:
${singles.join('\n') || '(none)'}

Not investigated (the investigation failed; nothing is known about them):
${notInvestigated.join(', ') || '(none)'}

Write the summary for the desk's lead: each shared cause as an incident, in order of how many customers
it affects, with what to do next; then the rest briefly; then say plainly which tickets were not
investigated. Use only what is above, and do not describe the investigation as complete if any were not.`,
    options: { model: SYNTHESIS_MODEL, tools: [], settingSources: [], permissionMode: 'dontAsk', maxTurns: 1, env: { ...process.env } },
  };
}
