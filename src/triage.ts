import { query } from '@anthropic-ai/claude-agent-sdk';
import { loadTickets, type Ticket } from './tickets.ts';

// One agent, one conversation, every open ticket. It reads the knowledge base with the built-in file
// tools and writes a triage report.

export function buildPrompt(tickets: Ticket[]): string {
  const list = tickets.map((t) => `## ${t.id}: ${t.subject}\n${t.body}`).join('\n\n');
  return `You are triaging a support desk's open tickets. The knowledge base is in data/kb/.
For each ticket, find the likely cause and say how sure you are. Then group tickets that share a cause.

${list}`;
}

export async function triage(): Promise<string> {
  const open = loadTickets().filter((t) => t.status === 'open');
  for await (const message of query({
    prompt: buildPrompt(open),
    options: { model: 'claude-opus-5-5', allowedTools: ['Read', 'Grep', 'Glob'] },
  })) {
    if (message.type === 'result') {
      return message.subtype === 'success' ? message.result : `failed: ${message.subtype}`;
    }
  }

  throw new Error('The query ended without a result.');
}
