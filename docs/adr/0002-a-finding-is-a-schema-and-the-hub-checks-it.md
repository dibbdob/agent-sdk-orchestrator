# 0002 A finding is a schema, and the hub checks it

Status: accepted

## Context

Workers returned prose. The hub could print it but not act on it: it could not tell which tickets shared
a cause, could not tell a confident finding from a guess, and could not check whether a cited release
note existed. A model asked to cite sources sometimes cites one that sounds right.

Passing every worker's prose, or every customer's message, on to a final summariser would also undo
ADR 0001: one context would again hold everything.

## Decision

- **Workers return a `Finding`** through the SDK's `outputFormat` (a JSON schema generated from one zod
  definition): the ticket id, the cause as a knowledge-base id or `unknown`, a short summary, a
  confidence, the ids relied on, and whether a person is needed.
- **The hub checks each finding against the knowledge base,** not against the worker's account of it.
  An invented id is removed and the finding drops to low confidence and goes to a person; a cause that is
  not among the cited evidence becomes `unknown`; high confidence with no evidence becomes medium. Each
  change is recorded on the finding with its reason. A reply about another ticket is rejected.
- **Incidents are found in code:** a cause with more than one customer is an incident.
- **The synthesiser sees findings, not customers.** Claude Opus 5.5 writes the lead's summary from the
  checked findings and the text of the items they cite. No customer message reaches it; a test checks
  every open ticket's body is absent from its prompt.

## Consequences

- The handoff between agents is a typed value with a test for each way it can be wrong, not a paragraph.
- The final context is small and contains nothing a customer wrote, so an instruction planted in a ticket
  cannot reach the agent with the widest view.
- Grouping by exact cause is strict: two tickets caused by the same release but by different changes in
  it (T-1008 and T-1011) are not one incident, which is the right answer for whoever has to fix them.
