import { readFileSync } from 'node:fs';

/** One support ticket. The subject and body were written by the customer. */
export type Ticket = {
  id: string;
  subject: string;
  body: string;
  status: 'open' | 'waiting' | 'closed';
  plan: string;
  priority: string;
  opened_at: string;
};

export function loadTickets(path = 'data/tickets.json'): Ticket[] {
  return JSON.parse(readFileSync(path, 'utf8')) as Ticket[];
}
