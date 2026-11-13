import type { Report } from './coordinator.ts';

/** The report as the desk's lead reads it: what is unsettled first, then incidents, then the rest. */
export function renderMarkdown(report: Report, runId: string): string {
  const lines: string[] = [];
  lines.push(`# Triage ${runId}`, '');
  lines.push(`- Status: **${report.status}**${report.status === 'partial' ? ' (some tickets were not investigated; see below)' : ''}`);
  lines.push(`- Tickets: ${report.results.length}, of which ${report.resumed} reused from an earlier run`);
  lines.push(`- Spent this run: $${report.costUsd.toFixed(2)}`, '');

  lines.push('## For a person', '');
  if (report.escalations.length === 0) {
    lines.push('Nothing the agents could not settle.', '');
  } else {
    lines.push('| Ticket | Priority | Why |', '|---|---|---|');
    for (const e of report.escalations) {
      lines.push(`| ${e.ticket_id} | ${e.priority} | ${e.reason.replaceAll('|', '/')} |`);
    }
    lines.push('');
  }

  lines.push('## Incidents', '');
  lines.push(...(report.incidents.length === 0
    ? ['No cause has more than one customer.']
    : report.incidents.map((i) => `- ${i.cause_id}: ${i.tickets.join(', ')}`)), '');

  lines.push('## Findings', '', '| Ticket | Cause | Confidence | Summary |', '|---|---|---|---|');
  for (const f of report.findings) {
    lines.push(`| ${f.ticket_id} | ${f.cause_id} | ${f.confidence} | ${f.summary.replaceAll('|', '/')} |`);
  }

  lines.push('', '## Summary', '', report.summary, '');
  return lines.join('\n');
}
